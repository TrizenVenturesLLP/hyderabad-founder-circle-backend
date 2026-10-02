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

const paymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["razorpay", "upi_qr", "upi_id", "payment_link", "qiyu", "other"],
      required: true,
    },
    enabled: { type: Boolean, default: true },
    label: { type: String, trim: true, default: "" },
    upiId: { type: String, trim: true, default: "" },
    paymentNumber: { type: String, trim: true, default: "" },
    paymentLink: { type: String, trim: true, default: "" },
    qrImageUrl: { type: String, trim: true, default: "" },
    razorpayKeyId: { type: String, trim: true, default: "" },
    qiyuMerchantId: { type: String, trim: true, default: "" },
    qiyuApiKey: { type: String, trim: true, default: "" },
    instructions: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const paymentTicketSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, required: true },
    label: { type: String, trim: true, default: "" },
    amountInr: { type: Number, required: true },
    memberCount: { type: Number, default: 1 },
  },
  { _id: false },
);

const paymentConfigSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    amountInr: { type: Number, default: 99 },
    currency: { type: String, trim: true, default: "INR" },
    methods: { type: [paymentMethodSchema], default: [] },
    tickets: { type: [paymentTicketSchema], default: [] },
  },
  { _id: false },
);

const eventSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ["meetup", "hackathon"],
      default: "meetup",
    },
    dateISO: { type: String, required: true, trim: true },
    endDateISO: { type: String, trim: true, default: "" },
    dateLabel: { type: String, required: true, trim: true },
    dateConfirmed: { type: Boolean, default: false },
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
      enum: ["open", "coming-soon", "completed"],
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
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    payment: { type: paymentConfigSchema, default: () => ({}) },
  },
  { timestamps: true },
);

eventSchema.index({ dateISO: 1 });
eventSchema.index({ status: 1, published: 1 });
eventSchema.index({ organizationId: 1, published: 1 });

export const Event = mongoose.model("Event", eventSchema);
