import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRoundTeamsForCutoff } from "./hackathonLeaderboard.js";

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
