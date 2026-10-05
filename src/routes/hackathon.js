import { Router } from "express";
import crypto from "node:crypto";
import { Hackathon } from "../models/Hackathon.js";
import multer from "multer";
import { HackathonSettings } from "../models/HackathonSettings.js";
import {
  ProblemStatement,
  TEAM_PROPOSAL_LIMIT,
  DEFAULT_PROBLEM_STATEMENT_CONTACT_INFO,
} from "../models/ProblemStatement.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  sendHackathonPasswordSetupEmail,
  sendHackathonRegistrationConfirmation,
  sendHackathonTeamInvitations,
} from "../services/emailNotification.js";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { HackathonParticipantAccount } from "../models/HackathonParticipantAccount.js";
import { HackathonJuryEvaluation } from "../models/HackathonJuryEvaluation.js";
import { findAccountBySetupToken } from "../services/hackathonParticipantAuth.js";
import { teamRoundOutcome } from "../services/hackathonLeaderboard.js";
import { isPlatformAdmin, requireAdmin } from "../middleware/auth.js";

/** Includes the Team Lead. */
const MAX_TEAM_MEMBERS = 6;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only PDF, PPT, and PPTX files are allowed."));
    }

    cb(null, true);
  },
});

const hackathonRouter = Router();
const CURRENT_HACKATHON_SLUG = "ai-hack-x-mrdu-2026";

async function requireCurrentHackathonAdmin(req, res, next) {
  try {
    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG });
    if (!program) return res.status(503).json({ message: "Hackathon is not configured." });
    if (
      !isPlatformAdmin(req) &&
      (!program.organizationId || String(program.organizationId) !== String(req.admin.organizationId))
    ) {
      return res.status(403).json({ message: "You cannot manage this Hackathon." });
    }
    req.adminHackathon = program;
    return next();
  } catch (error) {
    console.error("[hackathon admin authorization]", error);
    return res.status(500).json({ message: "Could not verify Hackathon access." });
  }
}

const ALLOWED_DOMAIN_IDS = ["ui-ux", "web-dev", "vibe-coding", "agentic-ai"];

function parseDomainIds(source) {
  const raw =
    Array.isArray(source?.domainIds) && source.domainIds.length
      ? source.domainIds
      : [source?.domainId];
  const ids = [...new Set(raw.map((value) => String(value || "").trim()).filter(Boolean))];
  return ids.length && ids.every((id) => ALLOWED_DOMAIN_IDS.includes(id)) ? ids : null;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function findParticipantTeam(email, phone) {
  const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
  if (!program) return null;
  const normalizedPhone = normalizePhone(phone);
  const teams = await Hackathon.find({
    hackathonId: program._id,
    $or: [{ email }, { "members.email": email }],
  });

  return teams.find((team) => {
    const isTeamLead =
      team.email === email && normalizePhone(team.phone) === normalizedPhone;
    const isTeamMember = team.members.some(
      (member) => member.email === email && normalizePhone(member.phone) === normalizedPhone,
    );

    return isTeamLead || isTeamMember;
  });
}

async function teamProposalState(team) {
  const [proposal, approved] = await Promise.all([
    ProblemStatement.findOne({ hackathonId: team.hackathonId, proposedByTeam: team._id })
      .sort({ createdAt: -1 })
      .select("id title domainId status rejectionReason createdAt")
      .lean(),
    ProblemStatement.countDocuments({
      hackathonId: team.hackathonId,
      proposedByTeam: { $ne: null },
      status: "active",
    }),
  ]);
  return {
    problemProposal: proposal
      ? {
          id: proposal.id,
          title: proposal.title,
          domainId: proposal.domainId,
          status: proposal.status,
          rejectionReason: proposal.rejectionReason || "",
          createdAt: proposal.createdAt,
        }
      : null,
    proposalSlots: { limit: TEAM_PROPOSAL_LIMIT, approved },
  };
}

hackathonRouter.post("/register", async (req, res) => {
  try {
    const { team_name, lead_name, email, phone, members } = req.body;
    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    if (!program) return res.status(503).json({ message: "Hackathon registration is unavailable." });

    if (
      !team_name?.trim() ||
      !lead_name?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !Array.isArray(members) ||
      members.length < 1 ||
      members.length > MAX_TEAM_MEMBERS
    ) {
      return res.status(400).json({
        message: "Please provide valid team and member details.",
      });
    }

    const existingTeam = await Hackathon.findOne({
      email: email.toLowerCase(),
      hackathonId: program._id,
    });

    if (existingTeam) {
      return res.status(403).json({
        message: "Team Lead is already registered. Please login.",
      });
    }

    const team = await Hackathon.create({
      hackathonId: program._id,
      team_name: team_name.trim(),
      lead_name: lead_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      members,
    });

    const [confirmationSent, invitations] = await Promise.all([
      sendHackathonRegistrationConfirmation({ team }),
      sendHackathonTeamInvitations({ team, members: team.members }),
    ]);
    const confirmationMessage = confirmationSent
      ? ` We've sent a confirmation email to ${team.email} with a link to set your password.`
      : " We couldn't send the confirmation email right now. Use \"Send me a link\" on the sign-in page to get your set-password link.";
    const invitationMessage = invitations.attempted
      ? invitations.failed
        ? ` Invitations sent to ${invitations.sent} of ${invitations.attempted} team members.`
        : ` Invitation emails sent to ${invitations.sent} team members.`
      : "";

    return res.status(201).json({
      message: `Team registration is successful.${confirmationMessage}${invitationMessage}`,
      confirmationSent,
      invitations,
      team,
    });
  } catch (error) {
    console.error("Hackathon registration error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

async function findTeamByParticipantEmail(hackathonId, email) {
  const teams = await Hackathon.find({
    hackathonId,
    $or: [{ email }, { "members.email": email }],
  });
  return teams.find((team) => team.email === email) || teams[0] || null;
}

function participantProfile(team, email) {
  if (team.email === email) {
    return { name: team.lead_name, email, phone: team.phone, role: "lead" };
  }
  const member = team.members.find((entry) => entry.email === email);
  return { name: member?.full_name || "Participant", email, phone: member?.phone || "", role: "member" };
}

hackathonRouter.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    const team = program ? await findTeamByParticipantEmail(program._id, email) : null;
    if (!team) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const account = await HackathonParticipantAccount.findOne({
      hackathonId: program._id,
      normalizedEmail: email,
    }).select("passwordHash");
    if (!account?.passwordHash) {
      return res.status(403).json({
        code: "PASSWORD_NOT_SET",
        message:
          team.email === email
            ? "You haven't set a password yet. Open the set-password link in your registration confirmation email, or request a new link below."
            : "You haven't set a password yet. Open the set-password link in your team invitation email, or request a new link below.",
      });
    }

    if (!(await bcrypt.compare(password, account.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    return res.status(200).json({
      message: "Login is successful",
      team,
      profile: participantProfile(team, email),
    });
  } catch (error) {
    console.error("Hackathon login error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

hackathonRouter.post("/password/validate", async (req, res) => {
  try {
    const account = await findAccountBySetupToken(req.body?.token);
    if (!account) {
      return res.status(410).json({
        message: "This link is invalid or has expired. Request a new link to set your password.",
      });
    }

    const team = await findTeamByParticipantEmail(account.hackathonId, account.normalizedEmail);
    if (!team) {
      return res.status(403).json({
        message: "This email is no longer part of a registered team.",
      });
    }
    return res.status(200).json({
      email: account.normalizedEmail,
      name: participantProfile(team, account.normalizedEmail).name,
      teamName: team.team_name,
      hasPassword: Boolean(account.passwordHash),
    });
  } catch (error) {
    console.error("Hackathon password link validation error:", error);
    return res.status(500).json({ message: "Could not verify this link." });
  }
});

hackathonRouter.post("/password/set", async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: "Password must be 8 to 128 characters." });
    }

    const account = await findAccountBySetupToken(req.body?.token);
    if (!account) {
      return res.status(410).json({
        message: "This link is invalid or has expired. Request a new link to set your password.",
      });
    }
    if (!(await findTeamByParticipantEmail(account.hackathonId, account.normalizedEmail))) {
      return res.status(403).json({
        message: "This email is no longer part of a registered team.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await HackathonParticipantAccount.findOneAndUpdate(
      {
        _id: account._id,
        setupTokenHash: account.setupTokenHash,
        setupTokenExpiresAt: { $gt: new Date() },
      },
      {
        $set: {
          passwordHash,
          passwordSetAt: new Date(),
          setupTokenHash: null,
          setupTokenExpiresAt: null,
        },
      },
      { new: true },
    );
    if (!updated) {
      return res.status(410).json({
        message: "This link has already been used. Request a new link to set your password.",
      });
    }

    return res.status(200).json({
      message: "Your password is set. Sign in to continue.",
      email: updated.normalizedEmail,
    });
  } catch (error) {
    console.error("Hackathon set password error:", error);
    return res.status(500).json({ message: "Could not set your password." });
  }
});

hackathonRouter.post("/password/request-link", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    const team = program ? await findTeamByParticipantEmail(program._id, email) : null;
    if (!team) {
      return res.status(404).json({
        message:
          "No team member was found with this email. Use the email your Team Lead registered you with.",
      });
    }

    const existing = await HackathonParticipantAccount.findOne({
      hackathonId: program._id,
      normalizedEmail: email,
    }).select("lastLinkSentAt");
    if (existing?.lastLinkSentAt && Date.now() - existing.lastLinkSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({
        message: "A link was sent less than a minute ago. Please wait before requesting another.",
      });
    }

    const sent = await sendHackathonPasswordSetupEmail({
      hackathonId: program._id,
      email,
      name: participantProfile(team, email).name,
      teamName: team.team_name,
    });
    if (!sent) {
      await HackathonParticipantAccount.updateOne(
        { hackathonId: program._id, normalizedEmail: email },
        { $set: { lastLinkSentAt: null } },
      );
      return res.status(502).json({
        message: "We couldn't send the email right now. Please try again in a minute.",
      });
    }
    return res.status(200).json({
      message: `We've sent a link to set your password to ${email}. Check your inbox and spam folder.`,
    });
  } catch (error) {
    console.error("Hackathon password link request error:", error);
    return res.status(500).json({ message: "Could not send the link. Please try again." });
  }
});

hackathonRouter.post("/user", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();

    const user = await findParticipantTeam(email, phone);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const program = user.hackathonId
      ? await HackathonProgram.findById(user.hackathonId).select("roundResults").lean()
      : null;
    let roundResult = teamRoundOutcome(program, user, { publishedOnly: true });
    if (roundResult?.status === "disqualified") {
      const cutoff = program?.roundResults?.find(
        (item) => item.round === roundResult.round,
      )?.cutoff;
      const evaluation = await HackathonJuryEvaluation.findOne({
        hackathonId: program?._id,
        teamId: user._id,
        round: roundResult.round,
        status: "submitted",
      })
        .select("totalScore")
        .lean();
      if (typeof cutoff !== "number" || !evaluation || evaluation.totalScore >= cutoff) {
        roundResult = user.problem_statement_id
          ? { round: roundResult.round, status: "pending", nextRound: null }
          : null;
      }
    }
    return res.status(200).json({
      message: "User found",
      user,
      roundResult,
      ...(await teamProposalState(user)),
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

hackathonRouter.post("/team/members", async (req, res) => {
  try {
    const leadEmail = String(req.body.email || "").trim().toLowerCase();
    const leadPhone = String(req.body.phone || "").trim();
    const fullName = String(req.body.member?.full_name || "").trim();
    const memberEmail = String(req.body.member?.email || "").trim().toLowerCase();
    const memberPhone = String(req.body.member?.phone || "").trim();

    if (
      !leadEmail ||
      !leadPhone ||
      !fullName ||
      !/^\S+@\S+\.\S+$/.test(memberEmail) ||
      !/^\+?[0-9\s()-]{10,}$/.test(memberPhone)
    ) {
      return res.status(400).json({ message: "Please provide valid team member details." });
    }

    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    const team = program ? await Hackathon.findOne({ email: leadEmail, phone: leadPhone, hackathonId: program._id }) : null;
    if (!team) {
      return res.status(401).json({ message: "Team lead verification failed." });
    }

    const teamEmails = new Set(
      team.members.map((member) => String(member.email || "").trim().toLowerCase()),
    );
    teamEmails.add(String(team.email).trim().toLowerCase());
    if (teamEmails.has(memberEmail)) {
      return res.status(409).json({ message: "This email is already on the team." });
    }

    if (team.members.length >= MAX_TEAM_MEMBERS) {
      return res
        .status(409)
        .json({ message: `Teams can have up to ${MAX_TEAM_MEMBERS} members, including the Team Lead.` });
    }

    const member = {
      full_name: fullName,
      email: memberEmail,
      phone: memberPhone,
    };
    const updatedTeam = await Hackathon.findOneAndUpdate(
      {
        _id: team._id,
        "members.email": { $ne: memberEmail },
        $expr: { $lt: [{ $size: { $ifNull: ["$members", []] } }, 4] },
      },
      { $push: { members: member } },
      { new: true, runValidators: true },
    );

    if (!updatedTeam) {
      return res.status(409).json({
        message: "This email is already on the team or the team is full.",
      });
    }

    const invitations = await sendHackathonTeamInvitations({
      team: updatedTeam,
      members: [member],
    });
    const invitationSent = invitations.sent === 1;

    return res.status(200).json({
      message: invitationSent
        ? "Member added and invitation email sent."
        : "Member added, but the invitation email could not be delivered.",
      invitationSent,
      user: updatedTeam,
    });
  } catch (error) {
    console.error("Add hackathon team member error:", error);
    return res.status(500).json({ message: "Could not add team member." });
  }
});

hackathonRouter.post("/team/members/invite", async (req, res) => {
  try {
    const leadEmail = String(req.body.email || "").trim().toLowerCase();
    const leadPhone = String(req.body.phone || "").trim();
    const memberEmail = String(req.body.member_email || "").trim().toLowerCase();

    if (!leadEmail || !leadPhone || !/^\S+@\S+\.\S+$/.test(memberEmail)) {
      return res.status(400).json({ message: "Please provide valid team and member details." });
    }

    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    const team = program ? await Hackathon.findOne({ email: leadEmail, phone: leadPhone, hackathonId: program._id }) : null;
    if (!team) {
      return res.status(401).json({ message: "Team lead verification failed." });
    }

    const member = team.members.find(
      (entry) => String(entry.email || "").trim().toLowerCase() === memberEmail,
    );
    if (!member) {
      return res.status(404).json({ message: "Team member not found." });
    }

    const invitations = await sendHackathonTeamInvitations({
      team,
      members: [member],
      isResend: true,
    });
    const invitationSent = invitations.sent === 1;

    return res.status(invitationSent ? 200 : 502).json({
      message: invitationSent
        ? "Invitation email sent."
        : "Invitation email could not be delivered. Check the email service authentication.",
      invitationSent,
    });
  } catch (error) {
    console.error("Resend hackathon team invitation error:", error);
    return res.status(500).json({ message: "Could not resend team invitation." });
  }
});

hackathonRouter.post("/confirm-problem", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();
    const statementId = String(req.body?.problem_statement_id || "").trim().toUpperCase();
    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    if (!program) return res.status(503).json({ message: "Hackathon is not configured." });

    if (!statementId) {
      return res
        .status(400)
        .json({ message: "Problem statement ID is required" });
    }

    const team = await findParticipantTeam(email, phone);
    if (!team) {
      return res.status(404).json({ message: "Team not found. Please sign in again." });
    }
    if (team.email !== email) {
      return res.status(403).json({
        message: `Only your Team Lead (${team.lead_name}) can select and confirm the problem statement.`,
      });
    }
    if (team.problem_statement_id) {
      return res.status(409).json({
        message: `Your team has already confirmed ${team.problem_statement_id}. A team can confirm only one problem statement.`,
      });
    }

    const statement = await ProblemStatement.findOne({
      hackathonId: program._id,
      id: statementId,
      $or: [{ status: "active" }, { status: { $exists: false } }],
    })
      .select("proposedByTeam")
      .lean();
    if (!statement) {
      return res.status(404).json({ message: "Problem statement not found for this Hackathon." });
    }
    if (statement.proposedByTeam) {
      return res.status(403).json({
        message: "This problem statement was proposed by another team and is reserved for them.",
      });
    }

    const user = await Hackathon.findOneAndUpdate(
      {
        _id: team._id,
        $or: [{ problem_statement_id: null }, { problem_statement_id: { $exists: false } }],
      },
      { $set: { problem_statement_id: statementId } },
      { new: true },
    );

    if (!user) {
      return res.status(409).json({
        message: "Your team has already confirmed a problem statement. A team can confirm only one.",
      });
    }
    await ProblemStatement.deleteMany({
      hackathonId: program._id,
      proposedByTeam: team._id,
      status: "pending_approval",
    });

    return res.status(200).json({
      message: "Problem statement confirmed successfully",
      user,
    });
  } catch (error) {
    console.error("Confirmation error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

hackathonRouter.post("/problem-proposals", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const industry = String(req.body?.industry || "").trim();
    const platform = String(req.body?.platform || "").trim();
    const domainIds = parseDomainIds({ domainId: req.body?.domainId });

    if (!domainIds || !title || !description) {
      return res.status(400).json({ message: "Choose a track and enter a title and description." });
    }
    if (
      title.length > 200 ||
      description.length > 5000 ||
      industry.length > 120 ||
      platform.length > 200
    ) {
      return res.status(400).json({ message: "One of the fields is too long." });
    }

    const team = await findParticipantTeam(email, phone);
    if (!team) {
      return res.status(404).json({ message: "Team not found. Please sign in again." });
    }
    if (team.email !== email) {
      return res.status(403).json({
        message: `Only your Team Lead (${team.lead_name}) can propose a problem statement.`,
      });
    }
    if (team.problem_statement_id) {
      return res.status(409).json({
        message: `Your team has already confirmed ${team.problem_statement_id}.`,
      });
    }

    const { problemProposal, proposalSlots } = await teamProposalState(team);
    if (problemProposal?.status === "pending_approval") {
      return res.status(409).json({
        message: "Your team already has a proposal waiting for admin approval.",
      });
    }
    if (proposalSlots.approved >= proposalSlots.limit) {
      return res.status(409).json({
        message: `All ${proposalSlots.limit} slots for team-proposed statements are taken. Please choose from the listed statements.`,
      });
    }

    await ProblemStatement.create({
      hackathonId: team.hackathonId,
      proposedByTeam: team._id,
      status: "pending_approval",
      id: `TP-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
      domainId: domainIds[0],
      domainIds,
      title,
      category: "Team proposal",
      industry,
      platform,
      description,
    });

    return res.status(201).json({
      message: "Proposal sent for admin approval.",
      ...(await teamProposalState(team)),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Could not allocate a proposal ID; please retry." });
    }
    console.error("Problem proposal error:", error);
    return res.status(500).json({ message: "Could not send your proposal." });
  }
});

hackathonRouter.get("/users", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const users = await Hackathon.find({ hackathonId: req.adminHackathon._id });

    return res.status(200).json({
      users,
    });
  } catch (error) {
    console.error("Fetch hackathon users error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

hackathonRouter.patch("/users/:id/evaluation", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const scoreKeys = [
      "problem_understanding",
      "innovation_creativity",
      "technical_implementation",
      "functionality_execution",
      "communication_presentation",
    ];
    const scores = req.body?.scores;
    const comments = req.body?.comments;

    if (
      !scores ||
      scoreKeys.some(
        (key) => !Number.isInteger(scores[key]) || scores[key] < 0 || scores[key] > 10,
      ) ||
      (comments !== undefined && typeof comments !== "string") ||
      (typeof comments === "string" && comments.length > 2000)
    ) {
      return res.status(400).json({ message: "Provide a score from 0 to 10 for every criterion." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid team ID." });
    }

    const user = await Hackathon.findOne({ _id: req.params.id, hackathonId: req.adminHackathon._id });

    if (!user) {
      return res.status(404).json({ message: "Team not found." });
    }

    if (!user.submission?.submitted_at) {
      return res.status(409).json({ message: "This team has not submitted a project." });
    }

    user.evaluation = {
      scores,
      comments: comments?.trim() || "",
      evaluated_at: new Date(),
    };
    await user.save();

    return res.status(200).json({ message: "Evaluation saved successfully.", user });
  } catch (error) {
    console.error("Save hackathon evaluation error:", error);

    return res.status(500).json({ message: "Could not save evaluation." });
  }
});

hackathonRouter.post("/submit", upload.single("ppt"), async (req, res) => {
  try {
    const { email, phone, github_repo, description, video_url } = req.body;

    if (
      !email ||
      !phone ||
      !github_repo?.trim() ||
      !description?.trim() ||
      !video_url?.trim()
    ) {
      return res.status(400).json({
        message: "Please provide all submission details.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Please upload your PPT/PDF file.",
      });
    }

    const participantTeam = await findParticipantTeam(String(email).trim().toLowerCase(), phone);
    if (!participantTeam) {
      return res.status(404).json({ message: "Team not found. Please sign in again." });
    }
    if (participantTeam.email !== String(email).trim().toLowerCase()) {
      return res.status(403).json({
        message: `Only your Team Lead (${participantTeam.lead_name}) can submit the project.`,
      });
    }
    if (!participantTeam.problem_statement_id) {
      return res.status(409).json({
        message: "Confirm your team's problem statement before submitting the project.",
      });
    }
    if (participantTeam.submission?.submitted_at) {
      return res.status(409).json({
        message: "Your team has already submitted its project.",
      });
    }

    const db = mongoose.connection.db;

    if (!db) {
      return res.status(500).json({
        message: "Database connection is not ready.",
      });
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "hackathon_ppts",
    });

    const fileId = new mongoose.Types.ObjectId();

    const uploadStream = bucket.openUploadStreamWithId(
      fileId,
      req.file.originalname,
      {
        contentType: req.file.mimetype,
        metadata: {
          email,
          phone,
        },
      },
    );

    uploadStream.end(req.file.buffer);

    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    const pptUrl = `/api/hackathon/ppt/${fileId.toString()}`;

    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    if (!program) return res.status(503).json({ message: "Hackathon is not configured." });
    const user = await Hackathon.findOneAndUpdate(
      { email, phone, hackathonId: program._id },
      {
        $set: {
          submission: {
            github_repo: github_repo.trim(),
            description: description.trim(),
            ppt_url: pptUrl,
            video_url: video_url.trim(),
            submitted_at: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!user) {
      await bucket.delete(fileId);

      return res.status(404).json({
        message: "Team not found",
      });
    }

    return res.status(200).json({
      message: "Project submitted successfully",
      user,
    });
  } catch (error) {
    console.error("Project submission error:", error);

    return res.status(500).json({
      message: error.message || "Internal server error",
    });
  }
});

hackathonRouter.get("/ppt/:fileId", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: "Invalid submission file ID." });
    }
    const db = mongoose.connection.db;

    if (!db) {
      return res.status(500).json({
        message: "Database connection is not ready.",
      });
    }

    const fileId = new mongoose.Types.ObjectId(req.params.fileId);

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "hackathon_ppts",
    });

    const files = await db
      .collection("hackathon_ppts.files")
      .find({ _id: fileId })
      .toArray();

    const linkedTeam = await Hackathon.exists({
      hackathonId: req.adminHackathon._id,
      "submission.ppt_url": `/api/hackathon/ppt/${req.params.fileId}`,
    });
    if (!linkedTeam) {
      return res.status(404).json({ message: "Submission file not found for this Hackathon." });
    }

    if (!files.length) {
      return res.status(404).json({
        message: "PPT file not found",
      });
    }

    res.set("Content-Type", files[0].contentType || "application/pdf");
    res.set("Content-Disposition", `inline; filename="${files[0].filename}"`);

    bucket.openDownloadStream(fileId).pipe(res);
  } catch (error) {
    console.error("PPT download error:", error);

    return res.status(500).json({
      message: "Unable to retrieve PPT file",
    });
  }
});

hackathonRouter.patch("/users/:id/suspend", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const user = await Hackathon.findOneAndUpdate(
      { _id: req.params.id, hackathonId: req.adminHackathon._id },
      { $set: { status: "suspended" } },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({
        message: "Team not found",
      });
    }

    return res.status(200).json({
      message: "Team suspended successfully",
      user,
    });
  } catch (error) {
    console.error("Suspend team error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

hackathonRouter.patch("/users/:id/activate", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const user = await Hackathon.findOneAndUpdate(
      { _id: req.params.id, hackathonId: req.adminHackathon._id },
      { $set: { status: "active" } },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({
        message: "Team not found",
      });
    }

    return res.status(200).json({
      message: "Team activated successfully",
      user,
    });
  } catch (error) {
    console.error("Activate team error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

hackathonRouter.delete("/users/:id", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    if (!isPlatformAdmin(req)) {
      return res.status(403).json({ message: "Only a Super Admin can remove registered teams." });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid team ID." });
    }

    const team = await Hackathon.findOneAndDelete({ _id: req.params.id, hackathonId: req.adminHackathon._id });

    if (!team) {
      return res.status(404).json({
        message: "Team not found",
      });
    }

    const cleanup = [
      HackathonJuryEvaluation.deleteMany({ hackathonId: team.hackathonId, teamId: team._id }),
      ProblemStatement.deleteMany({ hackathonId: team.hackathonId, proposedByTeam: team._id }),
      HackathonParticipantAccount.deleteMany({
        hackathonId: team.hackathonId,
        normalizedEmail: {
          $in: [team.email, ...(team.members || []).map((member) => member.email)]
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean),
        },
      }),
    ];
    const pptFileId = String(team.submission?.ppt_url || "").split("/").pop();
    if (mongoose.Types.ObjectId.isValid(pptFileId) && mongoose.connection.db) {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: "hackathon_ppts",
      });
      cleanup.push(bucket.delete(new mongoose.Types.ObjectId(pptFileId)));
    }
    const results = await Promise.allSettled(cleanup);
    results
      .filter((result) => result.status === "rejected")
      .forEach((result) => console.error("Remove team cleanup error:", result.reason));

    return res.status(200).json({
      message: `Team "${team.team_name}" removed successfully`,
    });
  } catch (error) {
    console.error("Remove team error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Get the current server-side release timer
hackathonRouter.get("/release-timer", async (req, res) => {
  try {
    let settings = await HackathonSettings.findOne();

    if (!settings) {
      settings = await HackathonSettings.create({
        releaseAt: null,
      });
    }

    return res.status(200).json({
      releaseAt: settings.releaseAt,
    });
  } catch (error) {
    console.error("Get hackathon release timer error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Admin saves the release timer
hackathonRouter.put("/release-timer", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const { releaseAt } = req.body;

    if (!releaseAt) {
      return res.status(400).json({
        message: "Release date and time are required.",
      });
    }

    const releaseDate = new Date(releaseAt);

    if (Number.isNaN(releaseDate.getTime())) {
      return res.status(400).json({
        message: "Invalid release date and time.",
      });
    }

    const settings = await HackathonSettings.findOneAndUpdate(
      {},
      {
        $set: {
          releaseAt: releaseDate,
        },
      },
      {
        new: true,
        upsert: true,
      },
    );

    return res.status(200).json({
      message: "Release timer saved successfully",
      releaseAt: settings.releaseAt,
    });
  } catch (error) {
    console.error("Save hackathon release timer error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Admin clears the timer and releases immediately
hackathonRouter.delete("/release-timer", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const settings = await HackathonSettings.findOneAndUpdate(
      {},
      {
        $set: {
          releaseAt: null,
        },
      },
      {
        new: true,
        upsert: true,
      },
    );

    return res.status(200).json({
      message: "Problem statements released",
      releaseAt: settings.releaseAt,
    });
  } catch (error) {
    console.error("Clear hackathon release timer error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Get all problem statements
hackathonRouter.get("/problem-statements", async (req, res) => {
  try {
    const program = await HackathonProgram.findOne({ slug: CURRENT_HACKATHON_SLUG }).select("_id");
    if (!program) return res.status(503).json({ message: "Hackathon is not configured." });
    const statements = await ProblemStatement.find({
      hackathonId: program._id,
      $or: [{ status: "active" }, { status: { $exists: false } }],
    })
      .select("-createdBy -reviewedBy -claimedBy -claimedAt -rejectionReason")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      // Team proposals are reserved for the team that proposed them.
      statements: statements.map(({ proposedByTeam, ...statement }) => ({
        ...statement,
        contactInfo: statement.contactInfo || DEFAULT_PROBLEM_STATEMENT_CONTACT_INFO,
        teamProposal: Boolean(proposedByTeam),
        available: !proposedByTeam,
      })),
    });
  } catch (error) {
    console.error("Get problem statements error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Create or update a problem statement
hackathonRouter.post("/problem-statements", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const {
      id,
      title,
      category,
      difficulty,
      organization,
      contactInfo,
      description,
      deliverables,
    } = req.body;
    const industry = String(req.body?.industry || "").trim();
    const organizationValue = String(organization || "").trim();
    const contactInfoValue = String(
      contactInfo === undefined ? DEFAULT_PROBLEM_STATEMENT_CONTACT_INFO : contactInfo,
    ).trim();
    const scope = String(req.body?.scope || "").trim();
    const platform = String(req.body?.platform || "").trim();
    const domainIds = parseDomainIds(req.body);
    const statementId =
      String(id || "").trim().toUpperCase() ||
      `ADM-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

    if (!domainIds || !title || !description) {
      return res.status(400).json({
        message: "At least one valid domain track, title and description are required.",
      });
    }
    if (industry.length > 120 || platform.length > 200 || scope.length > 3000) {
      return res.status(400).json({
        message: "Industry, scope, or platform/tech exceeds the allowed length.",
      });
    }
    if (!contactInfoValue || organizationValue.length > 200 || contactInfoValue.length > 200) {
      return res.status(400).json({ message: "Contact info is required and text fields must be within the allowed length." });
    }

    const statement = await ProblemStatement.findOneAndUpdate(
      { id: statementId, hackathonId: req.adminHackathon._id },
      {
        hackathonId: req.adminHackathon._id,
        id: statementId,
        domainId: domainIds[0],
        domainIds,
        title: title.trim(),
        organization: organizationValue,
        contactInfo: contactInfoValue,
        category: category?.trim() || "General",
        difficulty: difficulty || "Intermediate",
        industry,
        scope,
        platform,
        description: description.trim(),
        deliverables: Array.isArray(deliverables) ? deliverables : [],
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    return res.status(200).json({
      message: "Problem statement saved successfully",
      statement,
    });
  } catch (error) {
    console.error("Save problem statement error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Delete a problem statement
hackathonRouter.post("/problem-statements/bulk", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const items = req.body?.statements;
    if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
      return res.status(400).json({ message: "Provide between 1 and 100 problem statements." });
    }
    if (items.some((item) => {
      return !parseDomainIds(item) ||
        !["Beginner", "Intermediate", "Advanced"].includes(item?.difficulty || "Intermediate") ||
        !String(item?.title || "").trim() ||
        !String(item?.description || "").trim() ||
        String(item?.title || "").length > 200 ||
        String(item?.description || "").length > 10000 ||
        String(item?.industry || "").length > 120 ||
        String(item?.platform || "").length > 200 ||
        String(item?.scope || "").length > 3000 ||
        (item?.deliverables !== undefined && (!Array.isArray(item.deliverables) || item.deliverables.length > 30));
    })) {
      return res.status(400).json({ message: "Problem statements contain invalid fields." });
    }
    const created = [];
    for (const item of items) {
      const title = String(item?.title || "").trim();
      const description = String(item?.description || "").trim();
      const domainIds = parseDomainIds(item);
      if (!title || !description || !domainIds) {
        return res.status(400).json({ message: "Every statement needs a domain, title, and description." });
      }
      const id = `ADM-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
      created.push(await ProblemStatement.create({
        hackathonId: req.adminHackathon._id,
        createdBy: null,
        id,
        domainId: domainIds[0],
        domainIds,
        title,
        organization: String(item.organization || "").trim(),
        contactInfo: String(item.contactInfo || DEFAULT_PROBLEM_STATEMENT_CONTACT_INFO).trim() || DEFAULT_PROBLEM_STATEMENT_CONTACT_INFO,
        category: String(item.category || "General").trim(),
        difficulty: item.difficulty || "Intermediate",
        industry: String(item.industry || "").trim(),
        scope: String(item.scope || "").trim(),
        platform: String(item.platform || "").trim(),
        description,
        deliverables: Array.isArray(item.deliverables) ? item.deliverables : [],
      }));
    }
    return res.status(201).json({ statements: created });
  } catch (error) {
    console.error("Bulk add problem statements error:", error);
    return res.status(500).json({ message: "Could not import problem statements." });
  }
});

hackathonRouter.delete("/problem-statements", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const result = await ProblemStatement.deleteMany({ hackathonId: req.adminHackathon._id });
    return res.json({ ok: true, deletedCount: result.deletedCount || 0 });
  } catch (error) {
    console.error("Clear problem statements error:", error);
    return res.status(500).json({ message: "Could not clear problem statements." });
  }
});

hackathonRouter.delete("/problem-statements/:id", requireAdmin, requireCurrentHackathonAdmin, async (req, res) => {
  try {
    const statement = await ProblemStatement.findOneAndDelete({
      id: req.params.id.toUpperCase(),
      hackathonId: req.adminHackathon._id,
    });

    if (!statement) {
      return res.status(404).json({
        message: "Problem statement not found.",
      });
    }

    return res.status(200).json({
      message: "Problem statement deleted successfully",
    });
  } catch (error) {
    console.error("Delete problem statement error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});
export default hackathonRouter;
