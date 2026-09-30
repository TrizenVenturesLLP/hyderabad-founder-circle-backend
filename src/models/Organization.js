import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      enum: ["platform", "partner"],
      default: "partner",
    },
    status: {
      type: String,
      enum: ["active", "pending", "suspended"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

export const Organization = mongoose.model("Organization", organizationSchema);
