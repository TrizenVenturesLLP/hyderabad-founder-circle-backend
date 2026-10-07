import mongoose from "mongoose";

const hackathonRoundCertificateSchema = new mongoose.Schema(
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
    round: { type: Number, required: true, enum: [2] },
    participantName: { type: String, required: true, trim: true },
    teamName: { type: String, required: true, trim: true },
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
    round2CertificateEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

hackathonRoundCertificateSchema.index(
  { hackathonId: 1, participantId: 1, round: 1 },
  { unique: true, name: "hackathon_participant_round_certificate_unique" },
);
hackathonRoundCertificateSchema.index({ hackathonId: 1, teamId: 1, status: 1 });

export const HackathonRoundCertificate = mongoose.model(
  "HackathonRoundCertificate",
  hackathonRoundCertificateSchema,
);
