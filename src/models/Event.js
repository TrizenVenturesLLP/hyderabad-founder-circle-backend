import mongoose from "mongoose";

const speakerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    org: { type: String, trim: true, default: "" },
    badge: { type: String, trim: true, default: "" },
    bio: { type: String, trim: true, default: "" },
    linkedin: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    photo: { type: String, trim: true, default: "" },
    photoPosition: { type: String, trim: true, default: "" },
    photoPaddingBottom: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const hostSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, trim: true, default: "" },
    startup: { type: String, trim: true, default: "" },
    linkedin: { type: String, trim: true, default: "" },
    photo: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const eventSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    dateISO: { type: String, required: true, trim: true },
    dateLabel: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    venue: { type: String, required: true, trim: true },
    space: { type: String, trim: true, default: "" },
    area: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    mapsUrl: { type: String, trim: true, default: "" },
    mapsEmbedUrl: { type: String, trim: true, default: "" },
    city: { type: String, required: true, trim: true },
    seats: { type: Number, default: 40 },
    format: {
      type: String,
      enum: ["Offline", "Online", "Hybrid"],
      default: "Offline",
    },
    status: {
      type: String,
      enum: ["open", "coming-soon"],
      default: "open",
    },
    blurb: { type: String, trim: true, default: "" },
    hosts: { type: [hostSchema], default: [] },
    speakers: { type: [speakerSchema], default: [] },
    guestFounder: {
      name: { type: String, trim: true, default: "" },
      bio: { type: String, trim: true, default: "" },
      photo: { type: String, trim: true, default: "" },
    },
    published: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

eventSchema.index({ dateISO: 1 });
eventSchema.index({ status: 1, published: 1 });

export const Event = mongoose.model("Event", eventSchema);
