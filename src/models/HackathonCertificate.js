import mongoose from "mongoose";

const hackathonCertificateSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonProgram",
      required: true,
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonParticipantAccount",
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    participantName: { type: String, required: true, trim: true },
    teamName: { type: String, required: true, trim: true },
    certificateType: {
      type: String,
      enum: ["participation"],
      default: "participation",
      required: true,
    },
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

hackathonCertificateSchema.index(
  { hackathonId: 1, participantId: 1 },
  { unique: true, name: "hackathon_participant_certificate_unique" },
);
hackathonCertificateSchema.index({ hackathonId: 1, status: 1 });

export const HackathonCertificate = mongoose.model(
  "HackathonCertificate",
  hackathonCertificateSchema,
);
