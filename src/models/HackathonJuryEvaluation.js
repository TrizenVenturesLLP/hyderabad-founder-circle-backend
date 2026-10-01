import mongoose from "mongoose";

const criterionScoreSchema = new mongoose.Schema(
  {
    criterionId: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const hackathonJuryEvaluationSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonProgram",
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    juryMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JuryUser",
      required: true,
    },
    round: { type: Number, default: 1, min: 1 },
    rubricVersion: { type: Number, required: true, min: 1 },
    criteriaScores: { type: [criterionScoreSchema], default: [] },
    totalScore: { type: Number, default: 0, min: 0, max: 100 },
    comments: { type: String, default: "", maxlength: 3000 },
    status: { type: String, enum: ["draft", "submitted"], default: "draft" },
    submittedAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
    reopenedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

hackathonJuryEvaluationSchema.index(
  { hackathonId: 1, teamId: 1, juryMemberId: 1, round: 1 },
  { unique: true },
);
hackathonJuryEvaluationSchema.index({ hackathonId: 1, status: 1 });
hackathonJuryEvaluationSchema.index({ hackathonId: 1, round: 1, status: 1 });

export const HackathonJuryEvaluation = mongoose.model(
  "HackathonJuryEvaluation",
  hackathonJuryEvaluationSchema,
);
