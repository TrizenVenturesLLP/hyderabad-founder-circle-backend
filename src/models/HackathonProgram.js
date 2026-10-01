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
  },
  { timestamps: true },
);

export const HackathonProgram = mongoose.model(
  "HackathonProgram",
  hackathonProgramSchema,
);
