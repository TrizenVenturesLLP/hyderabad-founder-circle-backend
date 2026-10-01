import { Router } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { HackathonProgram } from "../../models/HackathonProgram.js";
import { HackathonJuryInvitation } from "../../models/HackathonJuryInvitation.js";
import { HackathonJuryMembership } from "../../models/HackathonJuryMembership.js";
import { HackathonJuryEvaluation } from "../../models/HackathonJuryEvaluation.js";
import { Hackathon } from "../../models/Hackathon.js";
import { ProblemStatement } from "../../models/ProblemStatement.js";
import { JuryUser } from "../../models/JuryUser.js";
import { isPlatformAdmin, requireAdmin } from "../../middleware/auth.js";
import { sendHackathonJuryInvitation } from "../../services/emailNotification.js";
import { buildHackathonLeaderboard } from "../../services/hackathonLeaderboard.js";

const router = Router();
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const JURY_WEB_APP_URL =
  process.env.JURY_WEB_APP_URL || "https://community.trizenventures.com";

router.use(requireAdmin);

router.get("/:hackathonId/problem-statements", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const statements = await ProblemStatement.find({ hackathonId: program._id })
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ statements });
  } catch (error) {
    console.error("[admin/hackathons problem statements]", error);
    return res.status(500).json({ error: "Could not load problem statements." });
  }
});

router.patch("/:hackathonId/problem-statements/:statementId/approval", async (req, res) => {
  try {
    if (!isPlatformAdmin(req)) {
      return res
        .status(403)
        .json({ error: "Only the Super Admin can approve or reject Problem Statements." });
    }
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const action = String(req.body?.action || "").trim().toLowerCase();
    if (!new Set(["approve", "reject"]).has(action)) {
      return res.status(400).json({ error: "Action must be approve or reject." });
    }
    const rejectionReason = String(req.body?.reason || "").trim().slice(0, 500);
    if (action === "reject" && !rejectionReason) {
      return res.status(400).json({ error: "A reason is required when rejecting a statement." });
    }
    const statement = await ProblemStatement.findOneAndUpdate(
      {
        hackathonId: program._id,
        id: String(req.params.statementId || "").trim().toUpperCase(),
        status: "pending_approval",
      },
      {
        $set: {
          status: action === "approve" ? "active" : "rejected",
          reviewedBy: req.admin.id,
          reviewedAt: new Date(),
          rejectionReason: action === "reject" ? rejectionReason : "",
        },
      },
      { new: true, runValidators: true },
    ).populate("createdBy", "name");
    if (!statement) {
      return res.status(404).json({ error: "Pending Problem Statement not found." });
    }
    return res.json({ statement });
  } catch (error) {
    console.error("[admin/hackathons problem statement approval]", error);
    return res.status(500).json({ error: "Could not review Problem Statement." });
  }
});

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function loadAuthorizedProgram(req, res) {
  const reference = String(req.params.hackathonId || "").trim();
  const program = mongoose.Types.ObjectId.isValid(reference)
    ? await HackathonProgram.findById(reference)
    : await HackathonProgram.findOne({ slug: reference.toLowerCase() });
  if (!program) {
    res.status(404).json({ error: "Hackathon not found." });
    return null;
  }
  if (
    !isPlatformAdmin(req) &&
    (!program.organizationId ||
      String(program.organizationId) !== String(req.admin.organizationId))
  ) {
    res.status(403).json({ error: "You cannot manage this Hackathon." });
    return null;
  }
  return program;
}

async function sendInvitationEmail(invitation, program, name = "", { isResend = false } = {}) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  invitation.tokenHash = hashToken(rawToken);
  invitation.expiresAt = expiresAt;
  invitation.status = "pending";
  invitation.revokedAt = null;
  invitation.lastSentAt = new Date();
  invitation.resendCount += 1;
  await invitation.save();

  const juryBaseUrl = JURY_WEB_APP_URL.replace(/\/$/, "");
  const invitationUrl = `${juryBaseUrl}/jury/invitation#token=${encodeURIComponent(rawToken)}`;
  const result = await sendHackathonJuryInvitation({
    email: invitation.email,
    name: name || invitation.inviteeName,
    hackathonName: program.name,
    invitationUrl,
    expiresAt,
    program,
    isResend,
    signInUrl: `${juryBaseUrl}/jury/login`,
  });
  invitation.deliveryStatus = result.sent ? "sent" : "failed";
  await invitation.save();
  return result;
}

router.post("/:hackathonId/jury-invitations", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const inviteeName = String(req.body?.name || "")
      .trim()
      .slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res
        .status(400)
        .json({ error: "A valid email address is required." });
    }

    await HackathonJuryInvitation.updateMany(
      {
        hackathonId: program._id,
        status: "pending",
        expiresAt: { $lte: new Date() },
      },
      { $set: { status: "expired" } },
    );
    const existingUser = await JuryUser.findOne({ normalizedEmail: email })
      .select("_id")
      .lean();
    const member = existingUser
      ? await HackathonJuryMembership.findOne({
          hackathonId: program._id,
          userId: existingUser._id,
          status: "active",
        }).lean()
      : null;
    if (member) {
      return res
        .status(409)
        .json({ error: "This email is already a Jury member." });
    }
    const existing = await HackathonJuryInvitation.findOne({
      hackathonId: program._id,
      normalizedEmail: email,
      status: "pending",
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "A pending invitation already exists." });
    }

    const invitation = await HackathonJuryInvitation.create({
      hackathonId: program._id,
      email,
      normalizedEmail: email,
      inviteeName,
      inviterId: req.admin.id,
      tokenHash: crypto.randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      deliveryStatus: "failed",
      resendCount: 0,
    });
    const delivery = await sendInvitationEmail(
      invitation,
      program,
      inviteeName,
    );
    return res.status(201).json({
      invitation: {
        id: String(invitation._id),
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        sentAt: invitation.lastSentAt,
        deliveryStatus: invitation.deliveryStatus,
      },
      emailSent: delivery.sent,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ error: "A pending invitation already exists." });
    }
    console.error("[admin/hackathons jury invite]", error);
    return res.status(500).json({ error: "Could not create Jury invitation." });
  }
});

router.get("/:hackathonId/jury-invitations", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    await HackathonJuryInvitation.updateMany(
      {
        hackathonId: program._id,
        status: "pending",
        expiresAt: { $lte: new Date() },
      },
      { $set: { status: "expired" } },
    );
    const items = await HackathonJuryInvitation.find({
      hackathonId: program._id,
    })
      .select(
        "email inviteeName status expiresAt createdAt updatedAt acceptedAt revokedAt lastSentAt deliveryStatus resendCount acceptedBy",
      )
      .populate("acceptedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items, total: items.length });
  } catch (error) {
    console.error("[admin/hackathons jury invitations]", error);
    return res.status(500).json({ error: "Could not load Jury invitations." });
  }
});

router.post(
  "/:hackathonId/jury-invitations/:invitationId/resend",
  async (req, res) => {
    try {
      const program = await loadAuthorizedProgram(req, res);
      if (!program) return;
      const invitation = await HackathonJuryInvitation.findOne({
        _id: req.params.invitationId,
        hackathonId: program._id,
      });
      if (!invitation)
        return res.status(404).json({ error: "Invitation not found." });
      if (["accepted", "revoked"].includes(invitation.status)) {
        return res
          .status(409)
          .json({ error: "Accepted or revoked invitations cannot be resent." });
      }
      const existingUser = await JuryUser.findOne({
        normalizedEmail: invitation.normalizedEmail,
      })
        .select("_id")
        .lean();
      if (
        existingUser &&
        (await HackathonJuryMembership.exists({
          hackathonId: program._id,
          userId: existingUser._id,
          status: "active",
        }))
      ) {
        return res
          .status(409)
          .json({ error: "This email is already a Jury member." });
      }
      const collision = await HackathonJuryInvitation.findOne({
        _id: { $ne: invitation._id },
        hackathonId: program._id,
        normalizedEmail: invitation.normalizedEmail,
        status: "pending",
        expiresAt: { $gt: new Date() },
      });
      if (collision)
        return res
          .status(409)
          .json({ error: "Another active invitation exists." });
      const delivery = await sendInvitationEmail(invitation, program, "", { isResend: true });
      return res.json({
        invitation: {
          id: String(invitation._id),
          email: invitation.email,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          sentAt: invitation.lastSentAt,
          deliveryStatus: invitation.deliveryStatus,
        },
        emailSent: delivery.sent,
      });
    } catch (error) {
      console.error("[admin/hackathons jury resend]", error);
      return res
        .status(500)
        .json({ error: "Could not resend Jury invitation." });
    }
  },
);

router.post(
  "/:hackathonId/jury-invitations/:invitationId/revoke",
  async (req, res) => {
    try {
      const program = await loadAuthorizedProgram(req, res);
      if (!program) return;
      const invitation = await HackathonJuryInvitation.findOne({
        _id: req.params.invitationId,
        hackathonId: program._id,
      });
      if (!invitation)
        return res.status(404).json({ error: "Invitation not found." });
      if (invitation.status === "accepted") {
        return res
          .status(409)
          .json({
            error:
              "Accepted invitations cannot be revoked; revoke the membership instead.",
          });
      }
      if (invitation.status === "revoked") {
        return res
          .status(409)
          .json({ error: "Invitation is already revoked." });
      }
      invitation.status = "revoked";
      invitation.revokedAt = new Date();
      invitation.tokenHash = crypto.randomBytes(32).toString("hex");
      await invitation.save();
      return res.json({ ok: true, status: invitation.status });
    } catch (error) {
      console.error("[admin/hackathons jury revoke]", error);
      return res
        .status(500)
        .json({ error: "Could not revoke Jury invitation." });
    }
  },
);

router.delete("/:hackathonId/jury-invitations/:invitationId", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.invitationId)) {
      return res.status(404).json({ error: "Invitation not found." });
    }
    const invitation = await HackathonJuryInvitation.findOne({
      _id: req.params.invitationId,
      hackathonId: program._id,
    });
    if (!invitation)
      return res.status(404).json({ error: "Invitation not found." });
    if (invitation.status === "accepted") {
      const juryUser = await JuryUser.findOne({
        normalizedEmail: invitation.normalizedEmail,
      })
        .select("_id")
        .lean();
      const activeMember =
        juryUser &&
        (await HackathonJuryMembership.exists({
          hackathonId: program._id,
          userId: juryUser._id,
          status: "active",
        }));
      if (activeMember) {
        return res.status(409).json({
          error:
            "This person is an active Jury member. Remove them from the Jury first.",
        });
      }
    }
    await invitation.deleteOne();
    return res.json({ ok: true, invitationId: String(invitation._id) });
  } catch (error) {
    console.error("[admin/hackathons jury invitation delete]", error);
    return res.status(500).json({ error: "Could not delete Jury invitation." });
  }
});

router.get("/:hackathonId/jury-members", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const [memberships, teamCount, evaluationStats] = await Promise.all([
      HackathonJuryMembership.find({ hackathonId: program._id })
        .populate("userId", "name email status createdAt")
        .sort({ acceptedAt: -1 })
        .lean(),
      Hackathon.countDocuments({ hackathonId: program._id, status: "active" }),
      HackathonJuryEvaluation.aggregate([
        { $match: { hackathonId: program._id } },
        {
          $group: {
            _id: "$juryMemberId",
            evaluated: {
              $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);
    const byUser = new Map(
      evaluationStats.map((item) => [String(item._id), item.evaluated]),
    );
    const items = memberships.map((membership) => {
      const evaluated = byUser.get(String(membership.userId?._id)) || 0;
      return {
        id: String(membership._id),
        userId: membership.userId?._id,
        name: membership.userId?.name,
        email: membership.userId?.email,
        status: membership.status,
        accountStatus: membership.userId?.status,
        joinedAt: membership.acceptedAt,
        teamsEvaluated: evaluated,
        teamsPending: Math.max(0, teamCount - evaluated),
        completionPercent: teamCount
          ? Math.round((evaluated / teamCount) * 100)
          : 0,
      };
    });
    return res.json({ items, total: items.length, teamCount });
  } catch (error) {
    console.error("[admin/hackathons jury members]", error);
    return res.status(500).json({ error: "Could not load Jury members." });
  }
});

router.delete("/:hackathonId/jury-members/:membershipId", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const membership = await HackathonJuryMembership.findOneAndUpdate(
      {
        _id: req.params.membershipId,
        hackathonId: program._id,
        status: "active",
      },
      { $set: { status: "revoked" } },
      { new: true },
    );
    if (!membership)
      return res
        .status(404)
        .json({ error: "Active Jury membership not found." });
    const juryUser = await JuryUser.findById(membership.userId).select(
      "normalizedEmail",
    );
    if (juryUser) {
      await HackathonJuryInvitation.updateMany(
        {
          hackathonId: program._id,
          normalizedEmail: juryUser.normalizedEmail,
          status: "pending",
        },
        { $set: { status: "revoked", revokedAt: new Date() } },
      );
    }
    const hasOtherAccess = await HackathonJuryMembership.exists({
      userId: membership.userId,
      status: "active",
    });
    if (!hasOtherAccess) {
      await JuryUser.updateOne(
        { _id: membership.userId },
        { $set: { status: "disabled" } },
      );
    }
    return res.json({
      ok: true,
      membershipId: String(membership._id),
      status: membership.status,
      accountDisabled: !hasOtherAccess,
    });
  } catch (error) {
    console.error("[admin/hackathons jury member revoke]", error);
    return res.status(500).json({ error: "Could not revoke Jury membership." });
  }
});

router.delete(
  "/:hackathonId/jury-members/:membershipId/permanent",
  async (req, res) => {
    try {
      const program = await loadAuthorizedProgram(req, res);
      if (!program) return;
      if (!mongoose.Types.ObjectId.isValid(req.params.membershipId)) {
        return res.status(404).json({ error: "Jury member not found." });
      }
      const membership = await HackathonJuryMembership.findOne({
        _id: req.params.membershipId,
        hackathonId: program._id,
      });
      if (!membership)
        return res.status(404).json({ error: "Jury member not found." });
      if (membership.status === "active") {
        return res.status(409).json({
          error: "Remove this Jury member before deleting their record.",
        });
      }
      await membership.deleteOne();
      return res.json({ ok: true, membershipId: String(membership._id) });
    } catch (error) {
      console.error("[admin/hackathons jury member delete]", error);
      return res
        .status(500)
        .json({ error: "Could not delete Jury member record." });
    }
  },
);

router.get("/:hackathonId/leaderboard", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    return res.json(await buildHackathonLeaderboard(program._id));
  } catch (error) {
    console.error("[admin/hackathons leaderboard]", error);
    return res.status(500).json({ error: "Could not load leaderboard." });
  }
});

router.get("/:hackathonId/evaluations", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const [evaluations, teams, memberships] = await Promise.all([
      HackathonJuryEvaluation.find({ hackathonId: program._id })
        .populate("juryMemberId", "name email")
        .lean(),
      Hackathon.find({ hackathonId: program._id, status: "active" })
        .select("team_name lead_name problem_statement_id")
        .sort({ createdAt: 1 })
        .lean(),
      HackathonJuryMembership.find({
        hackathonId: program._id,
        status: "active",
      })
        .populate("userId", "name email")
        .lean(),
    ]);
    const evaluationByPair = new Map(
      evaluations.map((evaluation) => [
        `${String(evaluation.teamId)}:${String(evaluation.juryMemberId?._id || evaluation.juryMemberId)}`,
        evaluation,
      ]),
    );
    const items = teams.flatMap((team) =>
      memberships.flatMap((membership) => {
        if (!membership.userId) return [];
        const pairId = `${String(team._id)}:${String(membership.userId._id)}`;
        const evaluation = evaluationByPair.get(pairId);
        return [
          {
            _id: evaluation ? String(evaluation._id) : pairId,
            teamId: {
              _id: String(team._id),
              team_name: team.team_name,
              lead_name: team.lead_name,
              problem_statement_id: team.problem_statement_id,
            },
            juryMemberId: {
              _id: String(membership.userId._id),
              name: membership.userId.name,
              email: membership.userId.email,
            },
            status: evaluation?.status || "pending",
            totalScore: evaluation?.totalScore || 0,
            comments: evaluation?.comments || "",
            criteriaScores: evaluation?.criteriaScores || [],
            submittedAt: evaluation?.submittedAt || null,
          },
        ];
      }),
    );
    const teamCount = teams.length;
    const assignedJuryCount = memberships.filter(
      (membership) => membership.userId,
    ).length;
    const submittedCount = items.filter(
      (item) => item.status === "submitted",
    ).length;
    return res.json({
      items,
      total: items.length,
      teamCount,
      assignedJuryCount,
      submittedCount,
      pendingCount: Math.max(0, teamCount * assignedJuryCount - submittedCount),
      rubric: program.rubric,
    });
  } catch (error) {
    console.error("[admin/hackathons evaluations]", error);
    return res.status(500).json({ error: "Could not load Jury evaluations." });
  }
});

router.post(
  "/:hackathonId/evaluations/:evaluationId/reopen",
  async (req, res) => {
    try {
      const program = await loadAuthorizedProgram(req, res);
      if (!program) return;
      const evaluation = await HackathonJuryEvaluation.findOneAndUpdate(
        {
          _id: req.params.evaluationId,
          hackathonId: program._id,
          status: "submitted",
        },
        {
          $set: {
            status: "draft",
            submittedAt: null,
            reopenedAt: new Date(),
            reopenedBy: req.admin.id,
          },
        },
        { new: true },
      );
      if (!evaluation)
        return res
          .status(404)
          .json({ error: "Submitted evaluation not found." });
      return res.json({ evaluation });
    } catch (error) {
      console.error("[admin/hackathons evaluation reopen]", error);
      return res.status(500).json({ error: "Could not reopen evaluation." });
    }
  },
);

export default router;
