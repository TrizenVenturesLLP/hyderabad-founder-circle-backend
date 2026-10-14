import assert from "node:assert/strict";
import { after } from "node:test";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  closeWinnerCertificateBrowser,
  generateHackathonWinnerCertificatePdf,
} from "./hackathonWinnerCertificatePdf.js";
import {
  HACKATHON_WINNER_TEAMS,
  resolveAdditionalWinnerTeams,
  resolveHackathonWinnerTeams,
} from "./hackathonWinnerCertificates.js";

after(async () => {
  await closeWinnerCertificateBrowser();
});

test("winner list contains the requested twelve placements and domains", () => {
  assert.equal(HACKATHON_WINNER_TEAMS.length, 12);
  assert.deepEqual(
    HACKATHON_WINNER_TEAMS.map(({ domainId, rank }) => `${domainId}:${rank}`),
    [
      "ui-ux:1", "ui-ux:2", "ui-ux:3",
      "vibe-coding:1", "vibe-coding:2", "vibe-coding:3",
      "agentic-ai:1", "agentic-ai:2", "agentic-ai:3",
      "web-dev:1", "web-dev:2", "web-dev:3",
    ],
  );
});

test("resolves only the named teams qualified in the published round-two results", () => {
  const teams = HACKATHON_WINNER_TEAMS.map((winner, index) => ({
    _id: `team-${index}`,
    team_name: winner.teamName,
    domainId: winner.domainId,
    email: `lead-${index}@example.com`,
    members: [{ email: `member-${index}@example.com` }],
  }));
  const winners = resolveHackathonWinnerTeams(
    teams,
    teams.map((team) => team._id),
  );

  assert.equal(winners.length, 12);
  assert.equal(winners[0].teamName, "Hack reapers");
  assert.deepEqual(winners[0].emails, ["lead-0@example.com", "member-0@example.com"]);
});

test("refuses to generate a winner certificate for a team not qualified in round two", () => {
  const winner = HACKATHON_WINNER_TEAMS[0];
  assert.throws(
    () =>
      resolveHackathonWinnerTeams(
        [{
          _id: "team-1",
          team_name: winner.teamName,
          domainId: winner.domainId,
          email: "lead@example.com",
          members: [],
        }],
        [],
      ),
    /not listed as qualified/,
  );
});

test("fails rather than issuing a winner certificate when a named team is missing", () => {
  assert.throws(() => resolveHackathonWinnerTeams([], []), /was not found/);
});

test("resolves an explicitly requested additional team from its problem statement domain", () => {
  const additional = resolveAdditionalWinnerTeams(
    [{
      _id: "test-team",
      team_name: "test",
      status: "active",
      domainId: null,
      problem_statement_id: "ADM-03104C6D4F",
      email: "lead@example.com",
      members: [{ email: "member@example.com" }],
    }],
    ["test-team"],
    [{ id: "ADM-03104C6D4F", domainId: "ui-ux" }],
  );

  assert.equal(additional[0].teamName, "test");
  assert.equal(additional[0].domainName, "UI/UX");
  assert.equal(additional[0].rank, null);
  assert.deepEqual(additional[0].emails, ["lead@example.com", "member@example.com"]);
});

test("renders one-page certificates from all three supplied placement templates", async () => {
  for (const rank of [1, 2, 3]) {
    const pdf = await generateHackathonWinnerCertificatePdf("Team Example", "UI/UX", rank);
    const document = await PDFDocument.load(pdf);
    assert.equal(document.getPageCount(), 1);
  }
});

test("preserves generic winner certificates for explicitly added unranked teams", async () => {
  const pdf = await generateHackathonWinnerCertificatePdf("Team Example", "UI/UX", null);
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
});

test("rejects unsupported winner placements", async () => {
  await assert.rejects(
    generateHackathonWinnerCertificatePdf("Team Example", "UI/UX", 4),
    /placement must be 1, 2, or 3/,
  );
});
