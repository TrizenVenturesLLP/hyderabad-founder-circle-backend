import mongoose from "mongoose";

const hackathonSettingsSchema = new mongoose.Schema(
  {
    releaseAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export const HackathonSettings = mongoose.model(
  "HackathonSettings",
  hackathonSettingsSchema,
);
