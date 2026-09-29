import mongoose from "mongoose";

const problemStatementSchema = new mongoose.Schema(
  {
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
