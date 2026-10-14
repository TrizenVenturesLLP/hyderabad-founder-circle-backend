import mongoose from "mongoose";

const hackathonWinnerCertificateSchema = new mongoose.Schema(
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
    teamName: { type: String, required: true, trim: true },
    domainId: { type: String, required: true, trim: true },
    domainName: { type: String, required: true, trim: true },
    rank: { type: Number, default: null, min: 1, max: 3 },
    bucket: { type: String, required: true, default: "certificates" },
    objectKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "generating", "generated", "failed"],
      default: "pending",
      required: true,
    },
    generatedAt: { type: Date, default: null },
    generationStartedAt: { type: Date, default: null },
    failureReason: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true },
);

hackathonWinnerCertificateSchema.index(
  { hackathonId: 1, teamId: 1 },
  { unique: true, name: "hackathon_team_winner_certificate_unique" },
);

export const HackathonWinnerCertificate = mongoose.model(
  "HackathonWinnerCertificate",
  hackathonWinnerCertificateSchema,
);
