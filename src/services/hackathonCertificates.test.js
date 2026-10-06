import assert from "node:assert/strict";
import { after } from "node:test";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { closeCertificateBrowser, generateParticipationCertificatePdf } from "./hackathonCertificatePdf.js";
import {
  certificateBelongsToParticipant,
  collectEligibleTeamPeople,
  eligibleHackathonTeams,
  processCertificateBatch,
} from "./hackathonCertificates.js";

after(async () => {
  await closeCertificateBrowser();
});

test("includes every unique person from active eligible teams and excludes duplicate leads", () => {
  const teams = [
    {
      _id: "team-a",
      team_name: "Team A",
      lead_name: "Asha Rao",
      email: "asha@example.com",
      members: [
        { full_name: "Asha Rao", email: "ASHA@example.com" },
        { full_name: "Irfan Khan", email: "irfan@example.com" },
      ],
    },
    {
      _id: "team-b",
      team_name: "Team B",
      lead_name: "Dev Patel",
      email: "dev@example.com",
      members: [{ full_name: "Mira Shah", email: "mira@example.com" }],
    },
  ];

  const people = collectEligibleTeamPeople(teams);
  assert.deepEqual(
    people.map(([email]) => email),
    ["asha@example.com", "irfan@example.com", "dev@example.com", "mira@example.com"],
  );
  assert.equal(people[0][1].team.team_name, "Team A");
});

test("excludes suspended and explicitly disqualified teams but retains winners and undecided active teams", () => {
  const program = {
    roundResults: [
      {
        round: 1,
        evaluatedTeamIds: ["winner", "lost"],
        qualifiedTeamIds: ["winner"],
        publishedAt: new Date(),
      },
    ],
  };
  const teams = [
    { _id: "winner", status: "active", problem_statement_id: "PS-1", round: 2 },
    { _id: "pending", status: "active", problem_statement_id: null, round: 1 },
    { _id: "lost", status: "active", problem_statement_id: "PS-2", round: 1 },
    { _id: "suspended", status: "suspended", problem_statement_id: "PS-3", round: 1 },
  ];

  assert.deepEqual(
    eligibleHackathonTeams(program, teams).map((team) => team._id),
    ["winner", "pending"],
  );
});

test("a participant cannot use another participant's certificate record", () => {
  const certificate = {
    participantId: "account-a",
    hackathonId: "hackathon-a",
  };

  assert.equal(certificateBelongsToParticipant(certificate, "account-a", "hackathon-a"), true);
  assert.equal(certificateBelongsToParticipant(certificate, "account-b", "hackathon-a"), false);
  assert.equal(certificateBelongsToParticipant(certificate, "account-a", "hackathon-b"), false);
});

test("continues after a failed PDF and retries only failed participants", async () => {
  const statuses = new Map([
    ["alpha", "pending"],
    ["beta", "pending"],
    ["gamma", "pending"],
  ]);
  let failBeta = true;
  const actions = {
    claim: async ({ id }) => {
      if (!["pending", "failed"].includes(statuses.get(id))) return null;
      statuses.set(id, "generating");
      return { id };
    },
    generate: async ({ id }) => {
      if (id === "beta" && failBeta) throw new Error("Browser render failed.");
    },
    complete: async ({ id }) => statuses.set(id, "generated"),
    fail: async ({ id }) => statuses.set(id, "failed"),
  };
  const participants = [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }];

  const firstRun = await processCertificateBatch(participants, {
    concurrency: 2,
    ...actions,
  });
  assert.deepEqual(firstRun, { generated: 2, failed: 1, skipped: 0 });
  assert.equal(statuses.get("beta"), "failed");

  failBeta = false;
  const retries = participants.filter(({ id }) => statuses.get(id) === "failed");
  const retryRun = await processCertificateBatch(retries, {
    concurrency: 2,
    ...actions,
  });
  assert.deepEqual(retryRun, { generated: 1, failed: 0, skipped: 0 });
  assert.equal(statuses.get("beta"), "generated");
});

test("uses bounded concurrency and atomically skips an already claimed participant", async () => {
  const statuses = new Map([["only", "pending"]]);
  let active = 0;
  let maxActive = 0;
  let generated = 0;
  const claim = async () => {
    if (statuses.get("only") !== "pending") return null;
    statuses.set("only", "generating");
    return true;
  };
  const options = {
    concurrency: 3,
    claim,
    generate: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      generated += 1;
    },
    complete: async () => statuses.set("only", "generated"),
    fail: async () => statuses.set("only", "failed"),
  };

  const results = await Promise.all([
    processCertificateBatch([{ id: "only" }], options),
    processCertificateBatch([{ id: "only" }], options),
  ]);
  assert.equal(generated, 1);
  assert.equal(maxActive, 1);
  assert.equal(results.reduce((sum, result) => sum + result.skipped, 0), 1);
});

test("renders the supplied template with long participant names without writing PDF files", async () => {
  const name =
    "Aarav Lakshman Reddy Venkata Narasimha Rao and Sai Kiran University Innovation Team";
  const pdf = await generateParticipationCertificatePdf(name);
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
  assert.ok(pdf.length > 100_000);
});
