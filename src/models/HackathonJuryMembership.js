import mongoose from "mongoose";

const hackathonJuryMembershipSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonProgram",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JuryUser",
      required: true,
    },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

hackathonJuryMembershipSchema.index(
  { hackathonId: 1, userId: 1 },
  { unique: true },
);
hackathonJuryMembershipSchema.index({ userId: 1, status: 1 });

export const HackathonJuryMembership = mongoose.model(
  "HackathonJuryMembership",
  hackathonJuryMembershipSchema,
);
