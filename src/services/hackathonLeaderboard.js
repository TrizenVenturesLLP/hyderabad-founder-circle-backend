import { Hackathon } from "../models/Hackathon.js";
import { HackathonJuryEvaluation } from "../models/HackathonJuryEvaluation.js";
import { HackathonJuryMembership } from "../models/HackathonJuryMembership.js";
import { ProblemStatement } from "../models/ProblemStatement.js";

const roundScore = (value) => Math.round(value * 10) / 10;

export async function buildHackathonLeaderboard(programId) {
  const [teams, evaluations, totalJuryMembers] = await Promise.all([
    Hackathon.find({ hackathonId: programId, status: "active" })
      .select("team_name lead_name problem_statement_id")
      .lean(),
    HackathonJuryEvaluation.aggregate([
      { $match: { hackathonId: programId, status: "submitted" } },
      {
        $group: {
          _id: "$teamId",
          scoreTotal: { $sum: "$totalScore" },
          highestScore: { $max: "$totalScore" },
          lowestScore: { $min: "$totalScore" },
          submittedEvaluations: { $sum: 1 },
        },
      },
    ]),
    HackathonJuryMembership.countDocuments({
      hackathonId: programId,
      status: "active",
    }),
  ]);

  const statementIds = [
    ...new Set(teams.map((team) => team.problem_statement_id).filter(Boolean)),
  ];
  const statements = statementIds.length
    ? await ProblemStatement.find({ hackathonId: programId, id: { $in: statementIds } })
        .select("id title domainId")
        .lean()
    : [];
  const statementById = new Map(statements.map((item) => [item.id, item]));
  const evaluationByTeam = new Map(
    evaluations.map((item) => [String(item._id), item]),
  );
  const requiredEvaluations = Math.min(2, Math.max(1, totalJuryMembers));

  const entries = teams.map((team) => {
    const result = evaluationByTeam.get(String(team._id));
    const submittedEvaluations = result?.submittedEvaluations || 0;
    const statement = statementById.get(team.problem_statement_id);
    return {
      teamId: String(team._id),
      teamName: team.team_name,
      leadName: team.lead_name || "",
      problemStatementId: team.problem_statement_id || "",
      problemStatementTitle: statement?.title || "",
      domainId: statement?.domainId || "",
      submittedEvaluations,
      totalJuryMembers,
      averageScore:
        submittedEvaluations >= requiredEvaluations
          ? roundScore(result.scoreTotal / submittedEvaluations)
          : null,
      highestScore: submittedEvaluations ? result.highestScore : null,
      lowestScore: submittedEvaluations ? result.lowestScore : null,
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

  return {
    requiredEvaluations,
    totalJuryMembers,
    teamCount: teams.length,
    rankedCount: ranked.length,
    items,
  };
}
