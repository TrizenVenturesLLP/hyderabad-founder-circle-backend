import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: "Admin" },
  },
  { timestamps: true },
);

export const Admin = mongoose.model("Admin", adminSchema);
