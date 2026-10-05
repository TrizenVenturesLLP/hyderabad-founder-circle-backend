import mongoose from "mongoose";

const hackathonJuryInvitationSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonProgram",
      required: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    inviteeName: { type: String, trim: true, default: "", maxlength: 120 },
    inviterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "expired"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JuryUser",
      default: null,
    },
    revokedAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: Date.now },
    deliveryStatus: {
      type: String,
      enum: ["sent", "failed"],
      default: "failed",
    },
    resendCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

hackathonJuryInvitationSchema.index(
  { hackathonId: 1, normalizedEmail: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
hackathonJuryInvitationSchema.index({
  hackathonId: 1,
  status: 1,
  createdAt: -1,
});

export const HackathonJuryInvitation = mongoose.model(
  "HackathonJuryInvitation",
  hackathonJuryInvitationSchema,
);
