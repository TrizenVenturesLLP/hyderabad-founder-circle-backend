import { Hackathon } from "../models/Hackathon.js";
import { HackathonJuryEvaluation } from "../models/HackathonJuryEvaluation.js";
import { HackathonJuryMembership } from "../models/HackathonJuryMembership.js";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { ProblemStatement } from "../models/ProblemStatement.js";
import { JuryUser } from "../models/JuryUser.js";

const roundScore = (value) => Math.round(value * 10) / 10;

/** Round 1 and 2 have qualifying cutoffs; Round 3 is the final round. */
export const MAX_EVALUATION_ROUNDS = 3;

export function teamRound(team) {
  const round = Number(team?.round);
  return Number.isInteger(round) && round >= 1 ? Math.min(round, MAX_EVALUATION_ROUNDS) : 1;
}

/** The final round can be scored only after the team has submitted its project. */
export function awaitingSubmission(team, round = teamRound(team)) {
  return round >= MAX_EVALUATION_ROUNDS && !team?.submission?.submitted_at;
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
 * A team's outcome in the highest evaluation round it took part in that has a decided result.
 * Pass `publishedOnly` for participant-facing views.
 */
export function teamRoundOutcome(program, team, { publishedOnly = false } = {}) {
  const teamId = String(team?._id);
  const results = (program?.roundResults || [])
    .filter((item) => item.round < MAX_EVALUATION_ROUNDS && (!publishedOnly || item.publishedAt))
    .sort((a, b) => b.round - a.round);

  const decided =
    results.find((item) =>
      Array.isArray(item.evaluatedTeamIds)
        ? item.evaluatedTeamIds.some((id) => String(id) === teamId)
        : teamRound(team) >= item.round,
    ) || results[0];

  if (!decided) return null;
  if (Array.isArray(decided.evaluatedTeamIds)) {
    if (!team?.problem_statement_id) return null;
    if (!decided.evaluatedTeamIds.some((id) => String(id) === teamId)) {
      return { round: decided.round, status: "pending", nextRound: null };
    }
    const qualified = (decided.qualifiedTeamIds || []).some((id) => String(id) === teamId);
    return qualified
      ? { round: decided.round, status: "qualified", nextRound: decided.round + 1 }
      : { round: decided.round, status: "disqualified", nextRound: null };
  }
  if (teamRound(team) > decided.round) {
    return { round: decided.round, status: "qualified", nextRound: decided.round + 1 };
  }
  return team?.problem_statement_id
    ? { round: decided.round, status: "pending", nextRound: null }
    : null;
}

export function evaluateRoundTeamsForCutoff(program, round, items, cutoff) {
  const scoredEntries = (items || []).filter(
    (entry) => entry && entry.averageScore !== null && entry.averageScore !== undefined,
  );
  const evaluatedTeamIds = scoredEntries.map((entry) => String(entry.teamId));
  const qualifiedTeamIds = scoredEntries
    .filter((entry) => Number(entry.averageScore) >= Number(cutoff))
    .map((entry) => String(entry.teamId));
  const qualifiedCount = qualifiedTeamIds.length;
  const disqualifiedCount = evaluatedTeamIds.length - qualifiedCount;

  const existingRoundResult = (program?.roundResults || []).find((item) => item.round === round);
  if (existingRoundResult) {
    existingRoundResult.evaluatedTeamIds = evaluatedTeamIds;
    existingRoundResult.qualifiedTeamIds = qualifiedTeamIds;
    existingRoundResult.qualifiedCount = qualifiedCount;
    existingRoundResult.disqualifiedCount = disqualifiedCount;
  }

  return {
    round,
    cutoff: Number(cutoff),
    evaluatedTeamIds,
    qualifiedTeamIds,
    qualifiedCount,
    disqualifiedCount,
  };
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
    maxRound: Math.min(MAX_EVALUATION_ROUNDS, Math.max(1, totals?.maxRound || 1)),
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
        .select("_id round submission.submitted_at")
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
  const owed = teams.reduce(
    (sum, team) => sum + teamRound(team) - (awaitingSubmission(team) ? 1 : 0),
    0,
  );
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
      .select("team_name lead_name problem_statement_id round domainId")
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
  const decision =
    round < MAX_EVALUATION_ROUNDS
      ? (program?.roundResults || []).find((item) => item.round === round) || null
      : null;
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
    const manuallyTracked = Array.isArray(decision?.evaluatedTeamIds);
    const evaluatedByAdmin = manuallyTracked
      ? decision.evaluatedTeamIds.some((id) => String(id) === teamId)
      : teamRound(team) > round;
    const qualifiedByAdmin = manuallyTracked
      ? (decision.qualifiedTeamIds || []).some((id) => String(id) === teamId)
      : teamRound(team) > round;
    return {
      teamId,
      teamName: team.team_name,
      leadName: team.lead_name || "",
      problemStatementId: team.problem_statement_id || "",
      problemStatementTitle: statement?.title || "",
      domainId: team.domainId || statement?.domainId || "",
      juryName: statement?.claimedBy?.name || "",
      submittedEvaluations,
      totalJuryMembers: ownerId ? 1 : 0,
      averageScore: score === null ? null : roundScore(score),
      provisionalScore: score === null ? null : roundScore(score),
      highestScore: score,
      lowestScore: score,
      teamRound: teamRound(team),
      advanced: teamRound(team) > round,
      qualification: decision
        ? !statement
          ? null
          : !evaluatedByAdmin
            ? "pending"
            : qualifiedByAdmin
              ? "qualified"
              : "disqualified"
        : null,
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
  const result = decision ? roundResultFor(program, round) : null;
  if (result) {
    result.qualifiedCount = items.filter((entry) => entry.qualification === "qualified").length;
    result.disqualifiedCount = items.filter(
      (entry) => entry.qualification === "disqualified",
    ).length;
  }

  return {
    round,
    maxRound,
    result,
    scoringComplete,
    requiredEvaluations,
    totalJuryMembers,
    teamCount: roundTeams.length,
    rankedCount: ranked.length,
    items,
  };
}
