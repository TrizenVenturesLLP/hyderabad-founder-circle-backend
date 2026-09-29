import mongoose from "mongoose";

const hackathonSchema = new mongoose.Schema(
  {
    team_name: {
      type: String,
      required: true,
      trim: true,
    },

    lead_name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },
    problem_statement_id: {
      type: String,
      default: null,
    },

    members: [
      {
        full_name: {
          type: String,
          required: true,
          trim: true,
        },
        email: {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
        },
        phone: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],

    submission: {
      github_repo: { type: String, default: null, trim: true },
      description: { type: String, default: null, trim: true },
      ppt_url: { type: String, default: null, trim: true },
      video_url: { type: String, default: null, trim: true },
      submitted_at: { type: Date, default: null },
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
  },
  { timestamps: true },
);

export const Hackathon = mongoose.model("Hackathon", hackathonSchema);
