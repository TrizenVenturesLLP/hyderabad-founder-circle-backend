import mongoose from "mongoose";

const juryUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetTokenExpiresAt: { type: Date, default: null },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

juryUserSchema.index({ normalizedEmail: 1 }, { unique: true });

export const JuryUser = mongoose.model("JuryUser", juryUserSchema);
