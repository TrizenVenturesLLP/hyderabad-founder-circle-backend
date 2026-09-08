import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: "Admin" },
    role: {
      type: String,
      enum: ["platform_admin", "org_admin"],
      default: "platform_admin",
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

export const Admin = mongoose.model("Admin", adminSchema);
