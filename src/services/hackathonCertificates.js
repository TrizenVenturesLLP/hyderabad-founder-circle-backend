import { Hackathon } from "../models/Hackathon.js";
import { HackathonCertificate } from "../models/HackathonCertificate.js";
import { HackathonParticipantAccount } from "../models/HackathonParticipantAccount.js";
import { teamRoundOutcome } from "./hackathonLeaderboard.js";
import { CERTIFICATES_BUCKET, uploadPrivatePdf } from "../lib/minio.js";
import { generateParticipationCertificatePdf } from "./hackathonCertificatePdf.js";

const CERTIFICATE_WORKERS = 3;
const STALE_GENERATION_MS = 10 * 60 * 1000;
const activeGenerations = new Set();

export function eligibleHackathonTeams(program, teams) {
  return teams.filter(
    (team) =>
      team.status === "active" &&
      teamRoundOutcome(program, team, { publishedOnly: true })?.status !== "disqualified",
  );
}

export function certificateBelongsToParticipant(certificate, participantId, hackathonId) {
  return Boolean(
    certificate &&
      String(certificate.participantId) === String(participantId) &&
      String(certificate.hackathonId) === String(hackathonId),
  );
}

function getTeamPeople(team) {
  return [
    { name: team.lead_name, email: team.email },
    ...(team.members || []).map((member) => ({
      name: member.full_name,
      email: member.email,
    })),
  ];
}

export function collectEligibleTeamPeople(teams) {
  const byEmail = new Map();
  for (const team of teams) {
    for (const person of getTeamPeople(team)) {
      const email = String(person.email || "").trim().toLowerCase();
      if (!email) {
        throw new Error(`Eligible team ${team._id} has a participant without an email address.`);
      }
      if (!byEmail.has(email)) {
        byEmail.set(email, { ...person, email, team });
      }
    }
  }
  return [...byEmail.entries()];
}

async function ensureParticipantAccounts(programId, teams) {
  const people = collectEligibleTeamPeople(teams);
  const emails = people.map(([email]) => email);
  const existingAccounts = await HackathonParticipantAccount.find({
    hackathonId: programId,
    normalizedEmail: { $in: emails },
  })
    .select("_id normalizedEmail")
    .lean();
  const accountByEmail = new Map(
    existingAccounts.map((account) => [account.normalizedEmail, account]),
  );

  const missingEmails = emails.filter((email) => !accountByEmail.has(email));
  await Promise.all(
    missingEmails.map(async (email) => {
      try {
        const account = await HackathonParticipantAccount.findOneAndUpdate(
          { hackathonId: programId, normalizedEmail: email },
          { $setOnInsert: { hackathonId: programId, normalizedEmail: email } },
          { new: true, upsert: true },
        )
          .select("_id normalizedEmail")
          .lean();
        accountByEmail.set(email, account);
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const account = await HackathonParticipantAccount.findOne({
          hackathonId: programId,
          normalizedEmail: email,
        })
          .select("_id normalizedEmail")
          .lean();
        if (!account) throw error;
        accountByEmail.set(email, account);
      }
    }),
  );

  return people.map(([email, person]) => {
    const account = accountByEmail.get(email);
    if (!account) {
      throw new Error(`Could not resolve the participant account for ${email}.`);
    }
    return {
      participantId: account._id,
      teamId: person.team._id,
      participantName: String(person.name || "").trim(),
      teamName: String(person.team.team_name || "").trim(),
      email,
    };
  });
}

export async function getEligibleCertificateParticipants(program) {
  const teams = await Hackathon.find({
    hackathonId: program._id,
    status: "active",
  })
    .select("_id team_name lead_name email members status")
    .sort({ team_name: 1, _id: 1 })
    .lean();
  const eligibleTeams = eligibleHackathonTeams(program, teams);
  return ensureParticipantAccounts(program._id, eligibleTeams);
}

async function ensureCertificateRecords(program, participants) {
  if (!participants.length) return;

  await HackathonCertificate.bulkWrite(
    participants.map((participant) => ({
      updateOne: {
        filter: {
          hackathonId: program._id,
          participantId: participant.participantId,
        },
        update: {
          $setOnInsert: {
            hackathonId: program._id,
            participantId: participant.participantId,
            teamId: participant.teamId,
            participantName: participant.participantName,
            teamName: participant.teamName,
            certificateType: "participation",
            bucket: CERTIFICATES_BUCKET,
            objectKey: `${program.slug}/${participant.participantId}.pdf`,
            status: "pending",
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function processCertificateBatch(
  participants,
  { concurrency = CERTIFICATE_WORKERS, claim, generate, complete, fail },
) {
  let nextIndex = 0;
  const counts = { generated: 0, failed: 0, skipped: 0 };

  async function worker() {
    while (nextIndex < participants.length) {
      const participant = participants[nextIndex];
      nextIndex += 1;
      const claimResult = await claim(participant);
      if (!claimResult) {
        counts.skipped += 1;
        continue;
      }

      try {
        await generate(participant, claimResult);
        await complete(participant);
        counts.generated += 1;
      } catch (error) {
        counts.failed += 1;
        try {
          await fail(participant, error);
        } catch (failureError) {
          console.error(
            "[hackathon certificates] Could not persist a failed certificate:",
            failureError,
          );
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), participants.length) },
      () => worker(),
    ),
  );
  return counts;
}

async function runGeneration(program, participants) {
  const key = String(program._id);
  try {
    return await processCertificateBatch(participants, {
      concurrency: CERTIFICATE_WORKERS,
      claim: (participant) =>
        HackathonCertificate.findOneAndUpdate(
          {
            hackathonId: program._id,
            participantId: participant.participantId,
            status: { $in: ["pending", "failed"] },
          },
          {
            $set: {
              status: "generating",
              generationStartedAt: new Date(),
              failureReason: "",
            },
          },
          { new: true },
        ),
      generate: async (participant, record) => {
        if (!record?.objectKey) throw new Error("Certificate generation claim was lost.");
        const buffer = await generateParticipationCertificatePdf(participant.participantName);
        await uploadPrivatePdf({
          bucket: CERTIFICATES_BUCKET,
          objectName: record.objectKey,
          buffer,
        });
      },
      complete: async (participant) => {
        const result = await HackathonCertificate.updateOne(
          {
            hackathonId: program._id,
            participantId: participant.participantId,
            status: "generating",
          },
          {
            $set: { status: "generated", generatedAt: new Date(), failureReason: "" },
            $unset: { generationStartedAt: 1 },
          },
        );
        if (!result.matchedCount) {
          throw new Error("Certificate status changed before generation completed.");
        }
      },
      fail: async (participant, error) => {
        const message = error instanceof Error ? error.message : String(error);
        const result = await HackathonCertificate.updateOne(
          {
            hackathonId: program._id,
            participantId: participant.participantId,
            status: "generating",
          },
          {
            $set: { status: "failed", failureReason: message.slice(0, 1000) },
            $unset: { generationStartedAt: 1 },
          },
        );
        if (!result.matchedCount) {
          console.error(
            `[hackathon certificates] Failed generation state was not saved for participant ${participant.participantId}.`,
          );
        }
      },
    });
  } finally {
    activeGenerations.delete(key);
  }
}

export async function startCertificateGeneration(program, { retryFailed = false } = {}) {
  const key = String(program._id);
  if (activeGenerations.has(key)) {
    return { queued: 0, generationRunning: true };
  }
  activeGenerations.add(key);

  try {
    const participants = await getEligibleCertificateParticipants(program);
    await ensureCertificateRecords(program, participants);

    await HackathonCertificate.updateMany(
      {
        hackathonId: program._id,
        status: "generating",
        generationStartedAt: { $lt: new Date(Date.now() - STALE_GENERATION_MS) },
      },
      {
        $set: { status: "pending", failureReason: "Previous generation did not complete." },
        $unset: { generationStartedAt: 1 },
      },
    );

    const eligibleIds = participants.map((participant) => participant.participantId);
    const statusFilter = retryFailed ? ["failed"] : ["pending", "failed"];
    const candidates = await HackathonCertificate.find({
      hackathonId: program._id,
      participantId: { $in: eligibleIds },
      status: { $in: statusFilter },
    })
      .select("participantId")
      .lean();
    const participantById = new Map(
      participants.map((participant) => [String(participant.participantId), participant]),
    );
    const queued = candidates
      .map((candidate) => participantById.get(String(candidate.participantId)))
      .filter(Boolean);

    if (!queued.length) {
      activeGenerations.delete(key);
      return { queued: 0, generationRunning: false };
    }

    void runGeneration(program, queued).catch((error) => {
      console.error("[hackathon certificates] Generation batch failed:", error);
    });

    return { queued: queued.length, generationRunning: true };
  } catch (error) {
    activeGenerations.delete(key);
    throw error;
  }
}

export async function getCertificateOverview(program) {
  const participants = await getEligibleCertificateParticipants(program);
  await ensureCertificateRecords(program, participants);

  const records = participants.length
    ? await HackathonCertificate.find({
        hackathonId: program._id,
        participantId: { $in: participants.map((participant) => participant.participantId) },
      })
        .select("participantId teamId participantName teamName status generatedAt objectKey")
        .lean()
    : [];
  const recordByParticipant = new Map(
    records.map((record) => [String(record.participantId), record]),
  );

  const items = participants.map((participant) => {
    const record = recordByParticipant.get(String(participant.participantId));
    return {
      participantId: String(participant.participantId),
      participantName: record?.participantName || participant.participantName,
      email: participant.email,
      teamId: String(record?.teamId || participant.teamId),
      teamName: record?.teamName || participant.teamName,
      status: record?.status === "generating" ? "pending" : record?.status || "pending",
      generatedAt: record?.generatedAt || null,
      certificate: record?.status === "generated" ? { participantId: String(record.participantId) } : null,
    };
  });
  const generated = items.filter((item) => item.status === "generated").length;
  const failed = items.filter((item) => item.status === "failed").length;

  return {
    totalEligible: items.length,
    generated,
    failed,
    pending: items.length - generated - failed,
    generationRunning: activeGenerations.has(String(program._id)),
    items,
  };
}

export async function isEligibleCertificateTeam(program, team) {
  return Boolean(
    team &&
      String(team.hackathonId) === String(program._id) &&
      team.status === "active" &&
      teamRoundOutcome(program, team, { publishedOnly: true })?.status !== "disqualified",
  );
}
