import mongoose from "mongoose";

const problemStatementSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: true, trim: true },
    organization: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
    targetDomain: { type: String, trim: true, default: "" },
    difficulty: { type: String, trim: true, default: "Advanced" },
    industry: { type: String, trim: true, default: "" },
    scope: { type: String, trim: true, default: "" },
    platformTech: { type: String, trim: true, default: "" },
    description: { type: String, required: true, trim: true },
    keyDeliverables: { type: [String], default: [] },
    published: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
  },
  { timestamps: true },
);

problemStatementSchema.index({ slug: 1 });
problemStatementSchema.index({ published: 1 });

export const ProblemStatement = mongoose.model(
  "ProblemStatement",
  problemStatementSchema,
);
