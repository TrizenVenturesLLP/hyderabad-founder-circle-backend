import { Hackathon } from "../models/Hackathon.js";
import { HackathonJuryEvaluation } from "../models/HackathonJuryEvaluation.js";
import { HackathonJuryMembership } from "../models/HackathonJuryMembership.js";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { ProblemStatement } from "../models/ProblemStatement.js";

const roundScore = (value) => Math.round(value * 10) / 10;

export const MAX_EVALUATION_ROUNDS = 10;

export function teamRound(team) {
  const round = Number(team?.round);
  return Number.isInteger(round) && round >= 1 ? round : 1;
}

/** Returns a valid round number, or `fallback` when the value is missing or invalid. */
export function parseRound(value, fallback = 1) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= MAX_EVALUATION_ROUNDS
    ? round
    : fallback;
}

export function roundResultFor(program, round) {
  const result = (program?.roundResults || []).find((item) => item.round === round);
  if (!result) return null;
  return {
    round: result.round,
    cutoff: result.cutoff,
    qualifiedCount: result.qualifiedCount,
    disqualifiedCount: result.disqualifiedCount,
    decidedAt: result.decidedAt,
    publishedAt: result.publishedAt,
  };
}

/**
 * A team's outcome in the latest round it took part in that has a decided result.
 * Pass `publishedOnly` for participant-facing views.
 */
export function teamRoundOutcome(program, team, { publishedOnly = false } = {}) {
  const latest = teamRound(team);
  const decided = (program?.roundResults || [])
    .filter((item) => item.round <= latest && (!publishedOnly || item.publishedAt))
    .sort((left, right) => right.round - left.round)[0];
  if (!decided) return null;
  return latest > decided.round
    ? { round: decided.round, status: "qualified", nextRound: decided.round + 1 }
    : { round: decided.round, status: "disqualified", nextRound: null };
}

/** Active team count and the highest round any team has reached. */
export async function teamRoundTotals(programId) {
  const [totals] = await Hackathon.aggregate([
    { $match: { hackathonId: programId, status: "active" } },
    {
      $group: {
        _id: null,
        teamCount: { $sum: 1 },
        maxRound: { $max: { $ifNull: ["$round", 1] } },
      },
    },
  ]);
  return {
    teamCount: totals?.teamCount || 0,
    maxRound: Math.max(1, totals?.maxRound || 1),
  };
}

/** Statement IDs a Jury member has claimed in a Hackathon. */
export function claimedStatementIds(programId, juryUserId) {
  return ProblemStatement.distinct("id", { hackathonId: programId, claimedBy: juryUserId });
}

/**
 * The teams a Jury member scores (those on statements they claimed) and how many
 * evaluations they owe across every round those teams reached.
 */
export async function juryWorkload(programId, juryUserId) {
  const statementIds = await claimedStatementIds(programId, juryUserId);
  const teams = statementIds.length
    ? await Hackathon.find({
        hackathonId: programId,
        status: "active",
        problem_statement_id: { $in: statementIds },
      })
        .select("_id round")
        .lean()
    : [];
  const evaluated = teams.length
    ? await HackathonJuryEvaluation.countDocuments({
        hackathonId: programId,
        juryMemberId: juryUserId,
        status: "submitted",
        teamId: { $in: teams.map((team) => team._id) },
      })
    : 0;
  const owed = teams.reduce((sum, team) => sum + teamRound(team), 0);
  return {
    claimedCount: statementIds.length,
    teamCount: teams.length,
    owed,
    evaluated: Math.min(evaluated, owed),
    pending: Math.max(0, owed - evaluated),
  };
}

export async function buildHackathonLeaderboard(programId, round = 1) {
  const [teams, evaluations, totalJuryMembers, program] = await Promise.all([
    Hackathon.find({ hackathonId: programId, status: "active" })
      .select("team_name lead_name problem_statement_id round")
      .lean(),
    HackathonJuryEvaluation.find({ hackathonId: programId, status: "submitted" })
      .select("teamId juryMemberId round totalScore")
      .lean(),
    HackathonJuryMembership.countDocuments({
      hackathonId: programId,
      status: "active",
    }),
    HackathonProgram.findById(programId).select("roundResults").lean(),
  ]);

  const maxRound = Math.max(1, ...teams.map(teamRound));
  const decision = roundResultFor(program, round);
  const roundTeams = teams.filter((team) => teamRound(team) >= round);

  const statementIds = [
    ...new Set(roundTeams.map((team) => team.problem_statement_id).filter(Boolean)),
  ];
  const statements = statementIds.length
    ? await ProblemStatement.find({ hackathonId: programId, id: { $in: statementIds } })
        .select("id title domainId claimedBy")
        .populate("claimedBy", "name")
        .lean()
    : [];
  const statementById = new Map(statements.map((item) => [item.id, item]));
  const scoreByKey = new Map(
    evaluations.map((item) => [
      `${String(item.teamId)}:${item.round || 1}:${String(item.juryMemberId)}`,
      item.totalScore,
    ]),
  );
  // Each team is scored only by the Jury member who claimed its problem statement.
  const requiredEvaluations = 1;

  const entries = roundTeams.map((team) => {
    const teamId = String(team._id);
    const statement = statementById.get(team.problem_statement_id);
    const ownerId = statement?.claimedBy?._id ? String(statement.claimedBy._id) : "";
    const ownerScore = (value) =>
      ownerId ? (scoreByKey.get(`${teamId}:${value}:${ownerId}`) ?? null) : null;
    const score = ownerScore(round);
    const submittedEvaluations = score === null ? 0 : 1;
    return {
      teamId,
      teamName: team.team_name,
      leadName: team.lead_name || "",
      problemStatementId: team.problem_statement_id || "",
      problemStatementTitle: statement?.title || "",
      domainId: statement?.domainId || "",
      juryName: statement?.claimedBy?.name || "",
      submittedEvaluations,
      totalJuryMembers: ownerId ? 1 : 0,
      averageScore: score === null ? null : roundScore(score),
      provisionalScore: score === null ? null : roundScore(score),
      highestScore: score,
      lowestScore: score,
      teamRound: teamRound(team),
      advanced: teamRound(team) > round,
      qualification: decision ? (teamRound(team) > round ? "qualified" : "disqualified") : null,
      roundScores: Array.from({ length: teamRound(team) }, (_, index) => {
        const value = ownerScore(index + 1);
        return {
          round: index + 1,
          submittedEvaluations: value === null ? 0 : 1,
          averageScore: value === null ? null : roundScore(value),
        };
      }),
      rank: null,
    };
  });

  const ranked = entries
    .filter((entry) => entry.averageScore !== null)
    .sort(
      (left, right) =>
        right.averageScore - left.averageScore ||
        left.teamName.localeCompare(right.teamName),
    );
  let rank = 0;
  let previousScore = null;
  ranked.forEach((entry, index) => {
    if (entry.averageScore !== previousScore) rank = index + 1;
    entry.rank = rank;
    previousScore = entry.averageScore;
  });

  const items = entries.sort((left, right) => {
    if (left.rank === null)
      return right.rank === null ? left.teamName.localeCompare(right.teamName) : 1;
    if (right.rank === null) return -1;
    return left.rank - right.rank;
  });

  const scoringComplete =
    entries.length > 0 &&
    entries.every((entry) => entry.totalJuryMembers > 0 && entry.submittedEvaluations > 0);

  return {
    round,
    maxRound,
    result: decision,
    scoringComplete,
    requiredEvaluations,
    totalJuryMembers,
    teamCount: roundTeams.length,
    rankedCount: ranked.length,
    items,
  };
}
