import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { HackathonCertificate } from "../models/HackathonCertificate.js";
import { ensureHackathonCertificateIndexes } from "../services/ensureHackathonCertificateIndexes.js";
import {
  getEligibleCertificateParticipants,
  startCertificateGeneration,
} from "../services/hackathonCertificates.js";
import { closeCertificateBrowser } from "../services/hackathonCertificatePdf.js";
import { CERTIFICATES_BUCKET } from "../lib/minio.js";
import { Client } from "minio";

const HACKATHON_SLUG = process.argv[2] || "ai-hack-x-mrdu-2026";
const MAX_WAIT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const PROGRESS_LOG_INTERVAL_MS = 30000;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");

  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  dns.setDefaultResultOrder("ipv4first");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await ensureHackathonCertificateIndexes();

  const program = await HackathonProgram.findOne({ slug: HACKATHON_SLUG });
  if (!program) throw new Error(`Hackathon "${HACKATHON_SLUG}" was not found.`);

  const participants = await getEligibleCertificateParticipants(program);
  const started = await startCertificateGeneration(program);
  console.log(
    `Certificate generation started for ${HACKATHON_SLUG}; ${participants.length} eligible participant(s), ${started.queued} queued.`,
  );

  const deadline = Date.now() + MAX_WAIT_MS;
  let previousGenerated = -1;
  let lastProgressAt = 0;
  let statusCounts = {};
  do {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const counts = await HackathonCertificate.aggregate([
      {
        $match: {
          hackathonId: program._id,
          participantId: { $in: participants.map((participant) => participant.participantId) },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    statusCounts = Object.fromEntries(counts.map(({ _id, count }) => [_id, count]));
    const generated = statusCounts.generated || 0;
    if (
      generated !== previousGenerated ||
      Date.now() - lastProgressAt >= PROGRESS_LOG_INTERVAL_MS
    ) {
      console.log(
        `Progress: ${generated}/${participants.length} generated; ${statusCounts.pending || 0} pending; ${statusCounts.generating || 0} generating; ${statusCounts.failed || 0} failed.`,
      );
      previousGenerated = generated;
      lastProgressAt = Date.now();
    }
    if (!(statusCounts.pending || statusCounts.generating)) break;
  } while (Date.now() < deadline);

  if (statusCounts.pending || statusCounts.generating) {
    throw new Error("Certificate generation did not finish within the 30-minute wait limit.");
  }

  const participantIds = participants.map((participant) => participant.participantId);
  const records = await HackathonCertificate.find({
    hackathonId: program._id,
    participantId: { $in: participantIds },
  })
    .select("participantId status objectKey")
    .lean();
  const generatedRecords = records.filter((record) => record.status === "generated");
  const expectedObjects = new Set(
    generatedRecords.map((record) => record.objectKey),
  );

  const endpoint = new URL(
    process.env.MINIO_ENDPOINT || process.env.MINIO_SERVER_URL || "http://127.0.0.1:9000",
  );
  const minio = new Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
    useSSL: endpoint.protocol === "https:",
    accessKey: process.env.MINIO_ROOT_USER || "",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "",
    region: process.env.MINIO_REGION_NAME || "us-east-1",
  });
  const actualObjects = new Set();
  for await (const object of minio.listObjectsV2(CERTIFICATES_BUCKET, `${program.slug}/`, true)) {
    if (object.name?.endsWith(".pdf")) actualObjects.add(object.name);
  }
  const missingObjects = [...expectedObjects].filter((objectKey) => !actualObjects.has(objectKey));
  const failedRecords = records.filter((record) => record.status === "failed");

  console.log(
    JSON.stringify(
      {
        hackathon: HACKATHON_SLUG,
        eligible: participants.length,
        generated: generatedRecords.length,
        pending: statusCounts.pending || 0,
        failed: failedRecords.length,
        minioObjectsForHackathon: actualObjects.size,
        missingMinioObjects: missingObjects.length,
        verified:
          records.length === participants.length &&
          generatedRecords.length === participants.length &&
          actualObjects.size === participants.length &&
          missingObjects.length === 0 &&
          failedRecords.length === 0,
      },
      null,
      2,
    ),
  );

  if (
    records.length !== participants.length ||
    generatedRecords.length !== participants.length ||
    actualObjects.size !== participants.length ||
    missingObjects.length !== 0 ||
    failedRecords.length !== 0
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      "[generate-hackathon-certificates]",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCertificateBrowser();
    await mongoose.disconnect();
  });
