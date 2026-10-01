import mongoose from "mongoose";

/** Max team-proposed statements an admin can approve per Hackathon. */
export const TEAM_PROPOSAL_LIMIT = 5;

const problemStatementSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonProgram",
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JuryUser",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending_approval", "active", "rejected"],
      default: "active",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: "", maxlength: 500 },
    // The one Jury member who scores every team that picks this statement.
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JuryUser",
      default: null,
      index: true,
    },
    claimedAt: { type: Date, default: null },
    // Set when a team proposed its own statement; only that team can work on it.
    proposedByTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      default: null,
      index: true,
    },
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    domainId: {
      type: String,
      required: true,
      trim: true,
    },
    // All tracks this statement appears under; domainId is always domainIds[0].
    domainIds: {
      type: [String],
      default: [],
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    difficulty: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Intermediate",
    },
    industry: { type: String, trim: true, default: "", maxlength: 120 },
    scope: { type: String, trim: true, default: "", maxlength: 3000 },
    platform: { type: String, trim: true, default: "", maxlength: 200 },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    deliverables: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const ProblemStatement = mongoose.model(
  "ProblemStatement",
  problemStatementSchema,
);
