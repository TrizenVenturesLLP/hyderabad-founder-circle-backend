import { Hackathon } from "../models/Hackathon.js";
import { HackathonWinnerCertificate } from "../models/HackathonWinnerCertificate.js";
import { CERTIFICATES_BUCKET } from "../lib/minio.js";

export const HACKATHON_WINNER_TEAMS = [
  { domainId: "ui-ux", domainName: "UI/UX", rank: 1, teamName: "Hack reapers" },
  { domainId: "ui-ux", domainName: "UI/UX", rank: 2, teamName: "Team not found" },
  { domainId: "ui-ux", domainName: "UI/UX", rank: 3, teamName: "Silent void" },
  { domainId: "vibe-coding", domainName: "Vibe Coding", rank: 1, teamName: "VibeStak" },
  { domainId: "vibe-coding", domainName: "Vibe Coding", rank: 2, teamName: "Velora" },
  { domainId: "vibe-coding", domainName: "Vibe Coding", rank: 3, teamName: "The phi" },
  { domainId: "agentic-ai", domainName: "Agentic AI", rank: 1, teamName: "CodeCommit" },
  { domainId: "agentic-ai", domainName: "Agentic AI", rank: 2, teamName: "It_Sparks" },
  { domainId: "agentic-ai", domainName: "Agentic AI", rank: 3, teamName: "Sanraksh" },
  { domainId: "web-dev", domainName: "Web Development", rank: 1, teamName: "Team Kaizen" },
  { domainId: "web-dev", domainName: "Web Development", rank: 2, teamName: "The Shush Patrol" },
  { domainId: "web-dev", domainName: "Web Development", rank: 3, teamName: "Vyom" },
];

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getTeamEmails(team) {
  const emails = [
    team.email,
    ...(team.members || []).map((member) => member.email),
  ].map((email) => String(email || "").trim().toLowerCase());
  if (emails.some((email) => !email)) {
    throw new Error(`Winner team "${team.team_name}" has a member without an email address.`);
  }
  return [...new Set(emails)];
}

export function resolveHackathonWinnerTeams(teams, qualifiedTeamIds) {
  const qualifiedIds = new Set((qualifiedTeamIds || []).map(String));
  return HACKATHON_WINNER_TEAMS.map((winner) => {
    const nameMatches = teams.filter(
      (team) => normalize(team.team_name) === normalize(winner.teamName),
    );
    const matchingTeams = nameMatches.filter(
      (team) => !team.domainId || normalize(team.domainId) === normalize(winner.domainId),
    );
    if (matchingTeams.length !== 1) {
      throw new Error(
        matchingTeams.length
          ? `Winner team "${winner.teamName}" is ambiguous in the Hackathon database.`
          : nameMatches.length
            ? `Winner team "${winner.teamName}" is not assigned to the ${winner.domainName} domain.`
            : `Winner team "${winner.teamName}" was not found in the Hackathon database.`,
      );
    }

    const team = matchingTeams[0];
    if (!qualifiedIds.has(String(team._id))) {
      throw new Error(
        `Winner team "${team.team_name}" is not listed as qualified in the published round-2 results.`,
      );
    }
    return {
      ...winner,
      teamId: team._id,
      teamName: String(team.team_name || "").trim(),
      emails: getTeamEmails(team),
    };
  });
}

const DOMAIN_NAMES = new Map([
  ["ui-ux", "UI/UX"],
  ["vibe-coding", "Vibe Coding"],
  ["agentic-ai", "Agentic AI"],
  ["web-dev", "Web Development"],
]);

export function resolveAdditionalWinnerTeams(teams, teamIds, problemStatements) {
  const selectedIds = new Set(teamIds.map(String));
  const statementById = new Map(
    problemStatements.map((statement) => [String(statement.id), statement]),
  );
  const selectedTeams = teams.filter((team) => selectedIds.has(String(team._id)));
  if (selectedTeams.length !== selectedIds.size) {
    throw new Error("One or more additional winner team IDs were not found in this Hackathon.");
  }

  return selectedTeams.map((team) => {
    if (team.status !== "active") {
      throw new Error(`Additional winner team "${team.team_name}" is not active.`);
    }
    const domainId =
      team.domainId || statementById.get(String(team.problem_statement_id))?.domainId;
    const domainName = DOMAIN_NAMES.get(String(domainId || "").toLowerCase());
    if (!domainName) {
      throw new Error(`Could not determine the domain for additional team "${team.team_name}".`);
    }
    return {
      domainId,
      domainName,
      rank: null,
      teamId: team._id,
      teamName: String(team.team_name || "").trim(),
      emails: getTeamEmails(team),
    };
  });
}

export async function ensureHackathonWinnerCertificateRecords(program, winners) {
  if (!winners.length) return;
  await HackathonWinnerCertificate.bulkWrite(
    winners.map((winner) => ({
      updateOne: {
        filter: { hackathonId: program._id, teamId: winner.teamId },
        update: {
          $set: {
            teamName: winner.teamName,
            domainId: winner.domainId,
            domainName: winner.domainName,
            rank: winner.rank,
          },
          $setOnInsert: {
            hackathonId: program._id,
            teamId: winner.teamId,
            bucket: CERTIFICATES_BUCKET,
            objectKey: `${program.slug}/winners/${winner.teamId}.pdf`,
            status: "pending",
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function getHackathonWinnerCertificateOverview(program) {
  const records = await HackathonWinnerCertificate.find({ hackathonId: program._id })
    .select("teamId teamName domainName rank status generatedAt")
    .sort({ domainName: 1, rank: 1 })
    .lean();
  if (!records.length) {
    return { total: 0, generated: 0, pending: 0, failed: 0, items: [] };
  }

  const teams = await Hackathon.find({
    hackathonId: program._id,
    _id: { $in: records.map((record) => record.teamId) },
  })
    .select("_id email members")
    .lean();
  const teamById = new Map(teams.map((team) => [String(team._id), team]));
  const items = records.map((record) => {
    const team = teamById.get(String(record.teamId));
    if (!team) {
      throw new Error(`Winner certificate team ${record.teamId} no longer exists.`);
    }
    return {
      teamId: String(record.teamId),
      teamName: record.teamName,
      domainName: record.domainName,
      rank: record.rank,
      status: record.status,
      generatedAt: record.generatedAt || null,
      emails: getTeamEmails(team),
    };
  });
  const generated = items.filter((item) => item.status === "generated").length;
  const failed = items.filter((item) => item.status === "failed").length;
  return {
    total: items.length,
    generated,
    failed,
    pending: items.length - generated - failed,
    items,
  };
}
