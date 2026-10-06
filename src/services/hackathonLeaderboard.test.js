import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRoundTeamsForCutoff, teamRoundOutcome } from "./hackathonLeaderboard.js";

test("evaluateRoundTeamsForCutoff marks only scored teams and respects the cutoff", () => {
  const program = {
    roundResults: [
      {
        round: 1,
        cutoff: 60,
        qualifiedCount: 0,
        disqualifiedCount: 0,
        evaluatedTeamIds: [],
        qualifiedTeamIds: [],
      },
    ],
  };

  const result = evaluateRoundTeamsForCutoff(program, 1, [
    { teamId: "team-a", averageScore: 80 },
    { teamId: "team-b", averageScore: 55 },
    { teamId: "team-c", averageScore: null },
  ], 60);

  assert.deepEqual(result.evaluatedTeamIds, ["team-a", "team-b"]);
  assert.deepEqual(result.qualifiedTeamIds, ["team-a"]);
  assert.equal(result.qualifiedCount, 1);
  assert.equal(result.disqualifiedCount, 1);
});

test("teamRoundOutcome keeps final-round non-qualifiers as disqualified when results are decided", () => {
  const program = {
    roundResults: [
      {
        round: 2,
        cutoff: 75,
        evaluatedTeamIds: ["team-a", "team-b"],
        qualifiedTeamIds: ["team-a"],
        qualifiedCount: 1,
        disqualifiedCount: 1,
        publishedAt: new Date("2026-10-04T00:00:00Z"),
      },
    ],
  };

  const team = { _id: "team-b", round: 2, problem_statement_id: "PS-1" };
  const outcome = teamRoundOutcome(program, team, { publishedOnly: true });

  assert.deepEqual(outcome, { round: 2, status: "disqualified", nextRound: null });
});
