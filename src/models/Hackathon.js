import mongoose from "mongoose";

const hackathonSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonProgram",
      default: null,
      index: true,
    },
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
      room_number: { type: String, default: null, trim: true },
      other_links: { type: String, default: null, trim: true },
      submitted_at: { type: Date, default: null },
    },

    evaluation: {
      scores: {
        problem_understanding: { type: Number, min: 0, max: 10 },
        innovation_creativity: { type: Number, min: 0, max: 10 },
        technical_implementation: { type: Number, min: 0, max: 10 },
        functionality_execution: { type: Number, min: 0, max: 10 },
        communication_presentation: { type: Number, min: 0, max: 10 },
      },
      comments: { type: String, default: "", maxlength: 2000 },
      evaluated_at: { type: Date, default: null },
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    /** Latest evaluation round the team has been selected for. */
    round: { type: Number, default: 1, min: 1 },
    /** Domain assigned to the team (ui-ux, vibe-coding, agentic-ai, web-dev). */
    domainId: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

export const Hackathon = mongoose.model("Hackathon", hackathonSchema);
