import "dotenv/config";
import mongoose from "mongoose";
import { Hackathon } from "../models/Hackathon.js";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { JuryUser } from "../models/JuryUser.js";
import { HackathonJuryMembership } from "../models/HackathonJuryMembership.js";
import { HackathonJuryInvitation } from "../models/HackathonJuryInvitation.js";
import { HackathonJuryEvaluation } from "../models/HackathonJuryEvaluation.js";
import { ProblemStatement } from "../models/ProblemStatement.js";

const slug = "ai-hack-x-mrdu-2026";
const rubric = [
  {
    id: "problem-identification",
    name: "Problem Identification & Relevance",
    maxMarks: 15,
    order: 1,
  },
  {
    id: "customer-understanding",
    name: "Customer/User Understanding",
    maxMarks: 10,
    order: 2,
  },
  {
    id: "solution-effectiveness",
    name: "Solution Effectiveness",
    maxMarks: 15,
    order: 3,
  },
  {
    id: "innovation-differentiation",
    name: "Innovation & Differentiation",
    maxMarks: 10,
    order: 4,
  },
  { id: "market-potential", name: "Market Potential", maxMarks: 10, order: 5 },
  {
    id: "validation-research",
    name: "Validation / Research",
    maxMarks: 15,
    order: 6,
  },
  {
    id: "business-model",
    name: "Business Model & Revenue",
    maxMarks: 10,
    order: 7,
  },
  {
    id: "prototype-implementation",
    name: "Prototype / Technical Implementation",
    maxMarks: 10,
    order: 8,
  },
  { id: "presentation-qa", name: "Presentation & Q&A", maxMarks: 5, order: 9 },
].map((criterion) => ({ ...criterion, description: "", active: true }));

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const program = await HackathonProgram.findOneAndUpdate(
    { slug },
    {
      $setOnInsert: {
        name: "AI HACK X MRDU 2026",
        slug,
        eventId: null,
        organizationId: null,
        description:
          "24-hour national hackathon hosted by the Department of CSE-AIML at Malla Reddy (MR) Deemed to be University.",
        status: "upcoming",
        startDate: new Date("2026-10-03T00:00:00.000Z"),
        endDate: new Date("2026-10-04T23:59:59.999Z"),
        rubricVersion: 1,
        rubric,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (program.rubric.length === 0) {
    program.rubric = rubric;
    program.rubricVersion = 1;
    await program.save();
  }

  const otherTeamLinks = await Hackathon.countDocuments({
    $and: [
      { hackathonId: { $exists: true, $ne: null } },
      { hackathonId: { $ne: program._id } },
    ],
  });
  const otherStatementLinks = await ProblemStatement.countDocuments({
    $and: [
      { hackathonId: { $exists: true, $ne: null } },
      { hackathonId: { $ne: program._id } },
    ],
  });
  if (otherTeamLinks || otherStatementLinks) {
    throw new Error(
      "Existing Hackathon or problem statement links conflict with the requested migration.",
    );
  }

  const [teamResult, statementResult] = await Promise.all([
    Hackathon.updateMany(
      { $or: [{ hackathonId: { $exists: false } }, { hackathonId: null }] },
      { $set: { hackathonId: program._id } },
    ),
    ProblemStatement.updateMany(
      { $or: [{ hackathonId: { $exists: false } }, { hackathonId: null }] },
      { $set: { hackathonId: program._id } },
    ),
  ]);

  const [legacyJuryStatements, legacyAdminStatements] = await Promise.all([
    ProblemStatement.updateMany(
      {
        hackathonId: program._id,
        status: { $exists: false },
        createdBy: { $exists: true, $ne: null },
      },
      { $set: { status: "pending_approval" } },
    ),
    ProblemStatement.updateMany(
      {
        hackathonId: program._id,
        status: { $exists: false },
        $or: [{ createdBy: null }, { createdBy: { $exists: false } }],
      },
      { $set: { status: "active" } },
    ),
  ]);

  await Promise.all([
    HackathonProgram.createIndexes(),
    JuryUser.createIndexes(),
    HackathonJuryMembership.createIndexes(),
    HackathonJuryInvitation.createIndexes(),
    HackathonJuryEvaluation.createIndexes(),
    Hackathon.createIndexes(),
    ProblemStatement.createIndexes(),
  ]);

  const [teamCount, statementCount, legacyEvaluations] = await Promise.all([
    Hackathon.countDocuments({ hackathonId: program._id }),
    ProblemStatement.countDocuments({ hackathonId: program._id }),
    Hackathon.countDocuments({
      hackathonId: program._id,
      evaluation: { $exists: true },
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        hackathon: program.slug,
        teamRecordsAssigned: teamCount,
        teamRecordsModified: teamResult.modifiedCount,
        problemStatementsAssigned: statementCount,
        problemStatementsModified: statementResult.modifiedCount,
        juryStatementsPendingApproval: legacyJuryStatements.modifiedCount,
        existingStatementsActivated: legacyAdminStatements.modifiedCount,
        legacyTeamEvaluationsPreserved: legacyEvaluations,
        eventId: program.eventId ? String(program.eventId) : null,
        organizationId: program.organizationId
          ? String(program.organizationId)
          : null,
      },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}
