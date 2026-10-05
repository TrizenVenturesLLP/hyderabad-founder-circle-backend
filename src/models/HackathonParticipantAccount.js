import mongoose from "mongoose";

const hackathonParticipantAccountSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonProgram",
      required: true,
    },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, default: null },
    passwordSetAt: { type: Date, default: null },
    setupTokenHash: { type: String, default: null },
    setupTokenExpiresAt: { type: Date, default: null },
    lastLinkSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

hackathonParticipantAccountSchema.index(
  { hackathonId: 1, normalizedEmail: 1 },
  { unique: true },
);
hackathonParticipantAccountSchema.index(
  { setupTokenHash: 1 },
  { unique: true, partialFilterExpression: { setupTokenHash: { $type: "string" } } },
);

export const HackathonParticipantAccount = mongoose.model(
  "HackathonParticipantAccount",
  hackathonParticipantAccountSchema,
);
