import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { HackathonRoundCertificate } from "../models/HackathonRoundCertificate.js";
import { getPrivateObjectUrl } from "../lib/minio.js";
import { getRound2DisqualifiedParticipants } from "../services/hackathonRound2Certificates.js";
import { sendHackathonRound2SelectionCertificateEmail } from "../services/emailNotification.js";

const HACKATHON_SLUG = process.argv[2] || "ai-hack-x-mrdu-2026";
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const WEB_APP_URL = (process.env.WEB_APP_URL || "https://ty.trizenventures.com").replace(/\/$/, "");

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  dns.setDefaultResultOrder("ipv4first");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const program = await HackathonProgram.findOne({ slug: HACKATHON_SLUG })
    .select("_id slug roundResults")
    .lean();
  if (!program) throw new Error(`Hackathon "${HACKATHON_SLUG}" was not found.`);
  const roundTwo = (program.roundResults || []).find(
    (result) => result.round === 2 && result.publishedAt,
  );
  if (!roundTwo || !Array.isArray(roundTwo.evaluatedTeamIds) || !Array.isArray(roundTwo.qualifiedTeamIds)) {
    throw new Error("Published round-2 team decisions are unavailable; no emails were sent.");
  }

  const participants = await getRound2DisqualifiedParticipants(program);
  if (!participants.length) throw new Error("No eligible round-2 participants were found.");
  const participantById = new Map(
    participants.map((participant) => [String(participant.participantId), participant]),
  );
  const records = await HackathonRoundCertificate.find({
    hackathonId: program._id,
    round: 2,
    status: "generated",
  })
    .select("_id participantId teamId participantName teamName bucket objectKey round2CertificateEmailSentAt")
    .lean();

  const eligibleRecords = records.filter((record) => participantById.has(String(record.participantId)));
  const unexpectedRecords = records.filter((record) => !participantById.has(String(record.participantId)));
  if (unexpectedRecords.length) {
    throw new Error(
      `Found ${unexpectedRecords.length} generated certificate record(s) outside the published eligible list; no emails were sent.`,
    );
  }
  const mismatches = eligibleRecords.filter((record) => {
    const participant = participantById.get(String(record.participantId));
    return (
      String(record.teamId) !== String(participant.teamId) ||
      record.bucket !== "certificates" ||
      record.objectKey !== `${program.slug}/round-2/${record.participantId}.pdf` ||
      !record.participantName?.trim() ||
      !participant.email
    );
  });
  if (mismatches.length) {
    throw new Error(
      `Found ${mismatches.length} certificate/participant ownership mismatch(es); no emails were sent.`,
    );
  }

  const toSend = eligibleRecords.filter((record) => !record.round2CertificateEmailSentAt);
  const dashboardLink = `${WEB_APP_URL}/dashboard/certificate`;
  let sent = 0;
  const failures = [];

  for (const record of toSend) {
    const participant = participantById.get(String(record.participantId));
    try {
      const certificateLink = await getPrivateObjectUrl(
        record.bucket,
        record.objectKey,
        { expirySeconds: SIGNED_URL_EXPIRY_SECONDS, disposition: "inline" },
      );
      await sendHackathonRound2SelectionCertificateEmail({
        email: participant.email,
        name: record.participantName,
        certificateLink,
        dashboardLink,
      });
      const sentAt = new Date();
      const update = await HackathonRoundCertificate.updateOne(
        { _id: record._id, status: "generated", round2CertificateEmailSentAt: null },
        { $set: { round2CertificateEmailSentAt: sentAt } },
      );
      if (update.matchedCount !== 1) {
        failures.push({
          participantId: String(record.participantId),
          reason: "Email was accepted, but the sent timestamp could not be recorded; verify before retrying.",
        });
        continue;
      }
      sent += 1;
    } catch (error) {
      failures.push({
        participantId: String(record.participantId),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        hackathon: program.slug,
        round: 2,
        eligibleParticipants: participants.length,
        generatedCertificateRecords: eligibleRecords.length,
        previouslySent: eligibleRecords.length - toSend.length,
        sentThisRun: sent,
        failedThisRun: failures.length,
        directCertificateLinkExpiresInDays: 7,
        permanentDashboardLinkIncluded: true,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Round-2 certificate email delivery failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
