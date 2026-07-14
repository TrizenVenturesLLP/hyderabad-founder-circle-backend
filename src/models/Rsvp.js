import mongoose from "mongoose";

const rsvpSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    countryCode: { type: String, trim: true, default: "+91" },
    linkedin: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    startupStage: { type: String, required: true, trim: true },
    gtmChallenges: {
      type: [String],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 3,
        message: "Select exactly 3 GTM challenges.",
      },
    },
    leaveWith: {
      type: [String],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Select at least one leave-with option.",
      },
    },
    industry: { type: String, required: true, trim: true },
    lookingFor: { type: [String], default: [] },
    offerCommunity: {
      type: [String],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Select at least one offer-community option.",
      },
    },
    wantToMeet: {
      type: [String],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Select at least one want-to-meet option.",
      },
    },
    canHelpWith: { type: String, trim: true, default: "" },
    biggestChallenge: { type: String, trim: true, default: "" },
    joinWhatsapp: { type: Boolean, default: false },
    subscribeUpdates: { type: Boolean, default: false },
    questions: { type: String, trim: true, default: "" },
    event: {
      slug: { type: String, required: true },
      title: { type: String, required: true },
      dateISO: { type: String, required: true },
      dateLabel: { type: String, required: true },
      time: { type: String, required: true },
      venue: { type: String, required: true },
      city: { type: String, required: true },
      format: { type: String, required: true },
    },
  },
  { timestamps: true },
);

rsvpSchema.index({ email: 1, "event.slug": 1 }, { unique: true });

export const Rsvp = mongoose.model("Rsvp", rsvpSchema);
