import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { Client } from "minio";
import { Hackathon } from "../models/Hackathon.js";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { ProblemStatement } from "../models/ProblemStatement.js";
import { HackathonWinnerCertificate } from "../models/HackathonWinnerCertificate.js";
import { CERTIFICATES_BUCKET, uploadPrivatePdf } from "../lib/minio.js";
import {
  ensureHackathonWinnerCertificateRecords,
  resolveAdditionalWinnerTeams,
  resolveHackathonWinnerTeams,
} from "../services/hackathonWinnerCertificates.js";
import {
  closeWinnerCertificateBrowser,
  generateHackathonWinnerCertificatePdf,
} from "../services/hackathonWinnerCertificatePdf.js";

const SCRIPT_ARGS = process.argv.slice(2);
const REFRESH_EXISTING = SCRIPT_ARGS.includes("--refresh");
const POSITIONAL_ARGS = SCRIPT_ARGS.filter((argument) => argument !== "--refresh");
const HACKATHON_SLUG = POSITIONAL_ARGS[0] || "ai-hack-x-mrdu-2026";
const ADDITIONAL_TEAM_IDS = [...new Set(POSITIONAL_ARGS.slice(1))];
const CONCURRENCY = 1;

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
  if (!roundTwo || !Array.isArray(roundTwo.qualifiedTeamIds)) {
    throw new Error("Published round-2 results are unavailable; no winner certificates were generated.");
  }

  if (ADDITIONAL_TEAM_IDS.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new Error("Additional winner team IDs must be valid MongoDB ObjectIds.");
  }
  const teams = await Hackathon.find({ hackathonId: program._id })
    .select("_id team_name domainId problem_statement_id status email members")
    .lean();
  const winners = resolveHackathonWinnerTeams(teams, roundTwo.qualifiedTeamIds);
  if (ADDITIONAL_TEAM_IDS.length) {
    const statements = await ProblemStatement.find({
      hackathonId: program._id,
      id: { $in: teams
        .filter((team) => ADDITIONAL_TEAM_IDS.includes(String(team._id)))
        .map((team) => team.problem_statement_id)
        .filter(Boolean) },
    })
      .select("id domainId")
      .lean();
    const existingWinnerIds = new Set(winners.map((winner) => String(winner.teamId)));
    winners.push(
      ...resolveAdditionalWinnerTeams(teams, ADDITIONAL_TEAM_IDS, statements).filter(
        (winner) => !existingWinnerIds.has(String(winner.teamId)),
      ),
    );
  }
  await HackathonWinnerCertificate.createIndexes();
  await ensureHackathonWinnerCertificateRecords(program, winners);

  let next = 0;
  const failures = [];
  async function worker() {
    while (next < winners.length) {
      const winner = winners[next++];
      const record = await HackathonWinnerCertificate.findOneAndUpdate(
        {
          hackathonId: program._id,
          teamId: winner.teamId,
          status: {
            $in: REFRESH_EXISTING
              ? ["pending", "failed", "generated"]
              : ["pending", "failed"],
          },
        },
        { $set: { status: "generating", generationStartedAt: new Date(), failureReason: "" } },
        { new: true },
      );
      if (!record) continue;
      const hadGeneratedCertificate = Boolean(record.generatedAt);

      try {
        const buffer = await generateHackathonWinnerCertificatePdf(
          winner.teamName,
          winner.domainName,
          winner.rank,
        );
        await uploadPrivatePdf({
          bucket: record.bucket,
          objectName: record.objectKey,
          buffer,
        });
        await HackathonWinnerCertificate.updateOne(
          { _id: record._id, status: "generating" },
          {
            $set: { status: "generated", generatedAt: new Date(), failureReason: "" },
            $unset: { generationStartedAt: 1 },
          },
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await HackathonWinnerCertificate.updateOne(
          { _id: record._id, status: "generating" },
          {
            $set: {
              status: hadGeneratedCertificate ? "generated" : "failed",
              failureReason: reason.slice(0, 1000),
            },
            $unset: { generationStartedAt: 1 },
          },
        );
        failures.push({
          team: winner.teamName,
          preservedExistingCertificate: hadGeneratedCertificate,
          reason,
        });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, winners.length) }, () => worker()),
  );

  const records = await HackathonWinnerCertificate.find({
    hackathonId: program._id,
    teamId: { $in: winners.map((winner) => winner.teamId) },
  })
    .select("teamId status objectKey")
    .lean();
  const generatedRecords = records.filter((record) => record.status === "generated");
  const expectedKeys = new Set(generatedRecords.map((record) => record.objectKey));
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
  const actualKeys = new Set();
  for await (const object of minio.listObjectsV2(
    CERTIFICATES_BUCKET,
    `${program.slug}/winners/`,
    true,
  )) {
    if (object.name?.endsWith(".pdf")) actualKeys.add(object.name);
  }
  const missingObjects = [...expectedKeys].filter((key) => !actualKeys.has(key));
  const summary = {
    hackathon: program.slug,
    eligibleWinnerTeams: winners.length,
    generated: generatedRecords.length,
    pending: records.filter((record) => record.status === "pending" || record.status === "generating")
      .length,
    failed: records.filter((record) => record.status === "failed").length,
    minioPdfObjects: actualKeys.size,
    missingMinioObjects: missingObjects.length,
    verified:
      records.length === winners.length &&
      generatedRecords.length === winners.length &&
      missingObjects.length === 0,
    expectedWinnerObjects: expectedKeys.size,
    totalWinnerPrefixObjects: actualKeys.size,
    failures,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.verified) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[generate-hackathon-winner-certificates]", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeWinnerCertificateBrowser();
    await mongoose.disconnect();
  });
