import mongoose from "mongoose";

const evaluationCriterionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    maxMarks: { type: Number, required: true, min: 1 },
    order: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const roundResultSchema = new mongoose.Schema(
  {
    round: { type: Number, required: true, min: 1 },
    cutoff: { type: Number, required: true, min: 0, max: 100 },
    qualifiedCount: { type: Number, default: 0, min: 0 },
    disqualifiedCount: { type: Number, default: 0, min: 0 },
    decidedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
  },
  { _id: false },
);

const hackathonProgramSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    description: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["draft", "upcoming", "ongoing", "completed", "archived"],
      default: "upcoming",
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    rubricVersion: { type: Number, default: 1, min: 1 },
    rubric: { type: [evaluationCriterionSchema], default: [] },
    /** Cutoff decision per round; teams at or above the cutoff move to the next round. */
    roundResults: { type: [roundResultSchema], default: [] },
    /** Most problem statements a single Jury member may claim. */
    juryClaimLimit: { type: Number, default: 20, min: 1, max: 500 },
  },
  { timestamps: true },
);

export const HackathonProgram = mongoose.model(
  "HackathonProgram",
  hackathonProgramSchema,
);
