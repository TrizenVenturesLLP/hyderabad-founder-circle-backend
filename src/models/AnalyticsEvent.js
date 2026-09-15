import mongoose from "mongoose";

const analyticsEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["pageview", "funnel"],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, index: true },
    path: { type: String, trim: true, default: "" },
    eventSlug: { type: String, trim: true, default: "", index: true },
    sessionId: { type: String, trim: true, default: "", index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

analyticsEventSchema.index({ createdAt: -1 });
analyticsEventSchema.index({ type: 1, name: 1, createdAt: -1 });

export const AnalyticsEvent = mongoose.model(
  "AnalyticsEvent",
  analyticsEventSchema,
);
