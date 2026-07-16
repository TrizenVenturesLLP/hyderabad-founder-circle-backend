import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    eventSlug: { type: String, trim: true, default: "" },
    recipientCount: { type: Number, default: 0 },
    recipients: [
      {
        email: String,
        name: String,
        rsvpId: String,
        status: { type: String, enum: ["sent", "failed"], default: "sent" },
        error: { type: String, default: "" },
      },
    ],
    attachmentNames: { type: [String], default: [] },
    sentBy: { type: String, trim: true, default: "" },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

emailLogSchema.index({ createdAt: -1 });

export const EmailLog = mongoose.model("EmailLog", emailLogSchema);
