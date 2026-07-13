import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 255,
    },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

contactSchema.index({ createdAt: -1 });

export const Contact = mongoose.model("Contact", contactSchema);
