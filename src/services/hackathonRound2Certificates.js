import { Hackathon } from "../models/Hackathon.js";
import { HackathonParticipantAccount } from "../models/HackathonParticipantAccount.js";
import { HackathonRoundCertificate } from "../models/HackathonRoundCertificate.js";
import { CERTIFICATES_BUCKET } from "../lib/minio.js";
import { teamRoundOutcome } from "./hackathonLeaderboard.js";

export function getRound2DisqualifiedTeams(program, teams) {
  const result = (program.roundResults || []).find(
    (roundResult) => roundResult.round === 2 && roundResult.publishedAt,
  );
  if (!result || !Array.isArray(result.evaluatedTeamIds) || !Array.isArray(result.qualifiedTeamIds)) {
    return [];
  }

  const qualifiedIds = new Set(result.qualifiedTeamIds.map(String));
  return teams.filter((team) => {
    const teamId = String(team._id);
    return (
      result.evaluatedTeamIds.some((id) => String(id) === teamId) &&
      !qualifiedIds.has(teamId) &&
      teamRoundOutcome(program, team, { publishedOnly: true })?.round === 2 &&
      teamRoundOutcome(program, team, { publishedOnly: true })?.status === "disqualified"
    );
  });
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

export function collectRound2DisqualifiedParticipants(teams) {
  const participantsByEmail = new Map();
  for (const team of teams) {
    for (const person of getTeamPeople(team)) {
      const email = String(person.email || "").trim().toLowerCase();
      if (!email) {
        throw new Error(`Round-2 disqualified team ${team._id} has a participant without an email address.`);
      }
      if (!participantsByEmail.has(email)) {
        participantsByEmail.set(email, {
          email,
          participantName: String(person.name || "").trim(),
          teamId: team._id,
          teamName: String(team.team_name || "").trim(),
        });
      }
    }
  }
  return [...participantsByEmail.values()];
}

export async function getRound2DisqualifiedParticipants(program, { ensureAccounts = false } = {}) {
  const teams = await Hackathon.find({ hackathonId: program._id })
    .select("_id hackathonId status round problem_statement_id team_name lead_name email members")
    .sort({ team_name: 1, _id: 1 })
    .lean();
  const disqualifiedTeams = getRound2DisqualifiedTeams(program, teams);
  const participants = collectRound2DisqualifiedParticipants(disqualifiedTeams);
  const accounts = await Promise.all(
    participants.map(async (participant) => {
      if (!ensureAccounts) {
        return HackathonParticipantAccount.findOne({
          hackathonId: program._id,
          normalizedEmail: participant.email,
        })
          .select("_id normalizedEmail")
          .lean();
      }
      try {
        return await HackathonParticipantAccount.findOneAndUpdate(
          { hackathonId: program._id, normalizedEmail: participant.email },
          { $setOnInsert: { hackathonId: program._id, normalizedEmail: participant.email } },
          { new: true, upsert: true },
        )
          .select("_id normalizedEmail")
          .lean();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const account = await HackathonParticipantAccount.findOne({
          hackathonId: program._id,
          normalizedEmail: participant.email,
        })
          .select("_id normalizedEmail")
          .lean();
        if (!account) throw error;
        return account;
      }
    }),
  );
  return participants.map((participant, index) => {
    const account = accounts[index];
    if (!account) {
      throw new Error(`Participant account is missing for ${participant.email}.`);
    }
    return { ...participant, participantId: account._id };
  });
}

export async function ensureRound2CertificateRecords(program, participants) {
  if (!participants.length) return;
  await HackathonRoundCertificate.bulkWrite(
    participants.map((participant) => ({
      updateOne: {
        filter: {
          hackathonId: program._id,
          participantId: participant.participantId,
          round: 2,
        },
        update: {
          $setOnInsert: {
            hackathonId: program._id,
            participantId: participant.participantId,
            teamId: participant.teamId,
            round: 2,
            participantName: participant.participantName,
            teamName: participant.teamName,
            bucket: CERTIFICATES_BUCKET,
            objectKey: `${program.slug}/round-2/${participant.participantId}.pdf`,
            status: "pending",
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function getRound2CertificateOverview(program) {
  const participants = await getRound2DisqualifiedParticipants(program);
  if (!participants.length) {
    return { totalDisqualified: 0, generated: 0, pending: 0, failed: 0, items: [] };
  }
  const records = await HackathonRoundCertificate.find({
    hackathonId: program._id,
    round: 2,
    participantId: { $in: participants.map((participant) => participant.participantId) },
  })
    .select("participantId teamId participantName teamName status generatedAt")
    .lean();
  const recordById = new Map(records.map((record) => [String(record.participantId), record]));
  const items = participants.map((participant) => {
    const record = recordById.get(String(participant.participantId));
    return {
      ...participant,
      status: record?.status || "pending",
      generatedAt: record?.generatedAt || null,
    };
  });
  const generated = items.filter((item) => item.status === "generated").length;
  const failed = items.filter((item) => item.status === "failed").length;
  return {
    totalDisqualified: items.length,
    generated,
    failed,
    pending: items.length - generated - failed,
    items,
  };
}
