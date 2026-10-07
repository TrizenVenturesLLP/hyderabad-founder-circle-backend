import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { HackathonRoundCertificate } from "../models/HackathonRoundCertificate.js";
import { uploadPrivatePdf } from "../lib/minio.js";
import { ensureRound2CertificateRecords, getRound2DisqualifiedParticipants } from "../services/hackathonRound2Certificates.js";
import {
  closeRound2CertificateBrowser,
  generateRound2SelectionCertificatePdf,
} from "../services/hackathonRound2CertificatePdf.js";

const HACKATHON_SLUG = process.argv[2] || "ai-hack-x-mrdu-2026";
const CONCURRENCY = 3;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  dns.setDefaultResultOrder("ipv4first");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const program = await HackathonProgram.findOne({ slug: HACKATHON_SLUG });
  if (!program) throw new Error(`Hackathon "${HACKATHON_SLUG}" was not found.`);
  const roundTwo = (program.roundResults || []).find(
    (result) => result.round === 2 && result.publishedAt,
  );
  if (!roundTwo || !Array.isArray(roundTwo.evaluatedTeamIds) || !Array.isArray(roundTwo.qualifiedTeamIds)) {
    throw new Error("Published round-2 team decisions are unavailable; no certificates were generated.");
  }
  if (
    roundTwo.evaluatedTeamIds.length !== 43 ||
    roundTwo.qualifiedTeamIds.length !== 12 ||
    roundTwo.evaluatedTeamIds.length - roundTwo.qualifiedTeamIds.length !== 31
  ) {
    throw new Error(
      `Round-2 decision totals did not match the expected 43 evaluated, 12 qualified, 31 disqualified (found ${roundTwo.evaluatedTeamIds.length}, ${roundTwo.qualifiedTeamIds.length}).`,
    );
  }

  const participants = await getRound2DisqualifiedParticipants(program, { ensureAccounts: true });
  await HackathonRoundCertificate.createIndexes();
  await ensureRound2CertificateRecords(program, participants);
  let next = 0;
  const generated = [];
  const failed = [];
  async function worker() {
    while (next < participants.length) {
      const participant = participants[next++];
      const record = await HackathonRoundCertificate.findOneAndUpdate(
        {
          hackathonId: program._id,
          participantId: participant.participantId,
          round: 2,
          status: { $in: ["pending", "failed"] },
        },
        {
          $set: { status: "generating", generationStartedAt: new Date(), failureReason: "" },
        },
        { new: true },
      );
      if (!record) continue;

      try {
        const buffer = await generateRound2SelectionCertificatePdf(participant.participantName);
        await uploadPrivatePdf({
          bucket: record.bucket,
          objectName: record.objectKey,
          buffer,
        });
        await HackathonRoundCertificate.updateOne(
          { _id: record._id, status: "generating" },
          {
            $set: { status: "generated", generatedAt: new Date(), failureReason: "" },
            $unset: { generationStartedAt: 1 },
          },
        );
        generated.push(participant.participantId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await HackathonRoundCertificate.updateOne(
          { _id: record._id, status: "generating" },
          {
            $set: { status: "failed", failureReason: reason.slice(0, 1000) },
            $unset: { generationStartedAt: 1 },
          },
        );
        failed.push({
          name: participant.participantName,
          team: participant.teamName,
          reason,
        });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, participants.length) }, () => worker()),
  );

  const records = await HackathonRoundCertificate.find({
    hackathonId: program._id,
    round: 2,
    participantId: { $in: participants.map((participant) => participant.participantId) },
  })
    .select("participantId status bucket objectKey")
    .lean();
  const actualKeys = new Set();
  const { Client } = await import("minio");
  const endpoint = new URL(process.env.MINIO_ENDPOINT || process.env.MINIO_SERVER_URL || "http://127.0.0.1:9000");
  const minio = new Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
    useSSL: endpoint.protocol === "https:",
    accessKey: process.env.MINIO_ROOT_USER || "",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "",
    region: process.env.MINIO_REGION_NAME || "us-east-1",
  });
  for await (const object of minio.listObjectsV2("certificates", `${program.slug}/round-2/`, true)) {
    if (object.name?.endsWith(".pdf")) actualKeys.add(object.name);
  }
  const expectedGenerated = records.filter((record) => record.status === "generated");
  const missingObjects = expectedGenerated.filter((record) => !actualKeys.has(record.objectKey));
  const summary = {
    hackathon: program.slug,
    round: 2,
    evaluatedTeams: roundTwo.evaluatedTeamIds.length,
    qualifiedTeams: roundTwo.qualifiedTeamIds.length,
    disqualifiedTeams: 31,
    eligibleParticipants: participants.length,
    generatedThisRun: generated.length,
    generatedRecords: expectedGenerated.length,
    pending: records.filter((record) => record.status === "pending" || record.status === "generating").length,
    failed: records.filter((record) => record.status === "failed").length,
    minioPdfObjects: actualKeys.size,
    missingMinioObjects: missingObjects.length,
    verified:
      records.length === participants.length &&
      expectedGenerated.length === participants.length &&
      actualKeys.size === participants.length &&
      missingObjects.length === 0,
    failures: failed,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.verified) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Round-2 selection certificate generation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRound2CertificateBrowser();
    await mongoose.disconnect();
  });
