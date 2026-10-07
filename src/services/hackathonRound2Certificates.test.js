import assert from "node:assert/strict";
import { after } from "node:test";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  closeRound2CertificateBrowser,
  generateRound2SelectionCertificatePdf,
} from "./hackathonRound2CertificatePdf.js";
import {
  collectRound2DisqualifiedParticipants,
  getRound2DisqualifiedTeams,
} from "./hackathonRound2Certificates.js";

after(async () => {
  await closeRound2CertificateBrowser();
});

test("selects only teams explicitly disqualified by the published round-2 result", () => {
  const program = {
    roundResults: [
      {
        round: 1,
        evaluatedTeamIds: ["round1-loser"],
        qualifiedTeamIds: [],
        publishedAt: new Date(),
      },
      {
        round: 2,
        evaluatedTeamIds: ["winner", "round2-loser"],
        qualifiedTeamIds: ["winner"],
        publishedAt: new Date(),
      },
    ],
  };
  const teams = [
    { _id: "winner", status: "active", round: 2, problem_statement_id: "PS-1" },
    { _id: "round2-loser", status: "active", round: 2, problem_statement_id: "PS-2" },
    { _id: "round1-loser", status: "active", round: 1, problem_statement_id: "PS-3" },
    { _id: "not-evaluated", status: "active", round: 2, problem_statement_id: "PS-4" },
  ];

  assert.deepEqual(
    getRound2DisqualifiedTeams(program, teams).map((team) => team._id),
    ["round2-loser"],
  );
});

test("collects each disqualified team member once including team leads", () => {
  const teams = [
    {
      _id: "team-a",
      team_name: "Team A",
      lead_name: "Asha Rao",
      email: "asha@example.com",
      members: [{ full_name: "Irfan Khan", email: "irfan@example.com" }],
    },
    {
      _id: "team-b",
      team_name: "Team B",
      lead_name: "Asha Rao",
      email: "ASHA@example.com",
      members: [],
    },
  ];

  assert.deepEqual(
    collectRound2DisqualifiedParticipants(teams).map((participant) => participant.email),
    ["asha@example.com", "irfan@example.com"],
  );
});

test("renders the supplied second-round selection design into a one-page named PDF", async () => {
  const pdf = await generateRound2SelectionCertificatePdf("Mukkanti Kavya sri");
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
  assert.ok(pdf.length > 100_000);
});
