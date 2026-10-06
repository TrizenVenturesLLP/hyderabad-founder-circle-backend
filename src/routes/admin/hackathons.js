import { Router } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { HackathonProgram } from "../../models/HackathonProgram.js";
import { HackathonJuryInvitation } from "../../models/HackathonJuryInvitation.js";
import { HackathonJuryMembership } from "../../models/HackathonJuryMembership.js";
import { HackathonJuryEvaluation } from "../../models/HackathonJuryEvaluation.js";
import { Hackathon } from "../../models/Hackathon.js";
import { HackathonCertificate } from "../../models/HackathonCertificate.js";
import {
  ProblemStatement,
  TEAM_PROPOSAL_LIMIT,
  DEFAULT_PROBLEM_STATEMENT_CONTACT_INFO,
} from "../../models/ProblemStatement.js";
import { JuryUser } from "../../models/JuryUser.js";
import { isPlatformAdmin, requireAdmin } from "../../middleware/auth.js";
import { sendHackathonJuryInvitation } from "../../services/emailNotification.js";
import { getPrivateObjectUrl } from "../../lib/minio.js";
import {
  getCertificateOverview,
  startCertificateGeneration,
} from "../../services/hackathonCertificates.js";
import {
  buildHackathonLeaderboard,
  juryWorkload,
  MAX_EVALUATION_ROUNDS,
  parseRound,
  roundResultFor,
  teamRound,
  teamRoundTotals,
} from "../../services/hackathonLeaderboard.js";

const router = Router();
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const JURY_WEB_APP_URL =
  process.env.JURY_WEB_APP_URL || "https://community.trizenventures.com";

router.use(requireAdmin);

router.post("/:hackathonId/certificates/generate", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const result = await startCertificateGeneration(program, {
      retryFailed: req.body?.retryFailed === true,
    });
    return res.status(202).json({ ok: true, ...result });
  } catch (error) {
    console.error("[admin/hackathons certificate generation]", error);
    return res.status(500).json({ error: "Could not start certificate generation." });
  }
});

router.get("/:hackathonId/certificates", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    return res.json(await getCertificateOverview(program));
  } catch (error) {
    console.error("[admin/hackathons certificates]", error);
    return res.status(500).json({ error: "Could not load Hackathon certificates." });
  }
});

router.get("/:hackathonId/certificates/:participantId/download", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.participantId)) {
      return res.status(400).json({ error: "Invalid participant." });
    }
    const certificate = await HackathonCertificate.findOne({
      hackathonId: program._id,
      participantId: req.params.participantId,
      status: "generated",
    })
      .select("bucket objectKey")
      .lean();
    if (!certificate) {
      return res.status(404).json({ error: "Generated certificate not found." });
    }

    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const url = await getPrivateObjectUrl(certificate.bucket, certificate.objectKey, {
      expirySeconds: 15 * 60,
      disposition,
    });
    return res.json({ url, expiresIn: 15 * 60 });
  } catch (error) {
    console.error("[admin/hackathons certificate download]", error);
    return res.status(500).json({ error: "Could not create a certificate link." });
  }
});

router.get("/:hackathonId/problem-statements", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const [statements, teams] = await Promise.all([
      ProblemStatement.find({ hackathonId: program._id })
        .populate("createdBy", "name")
        .populate("claimedBy", "name email")
        .populate("proposedByTeam", "team_name lead_name")
        .sort({ createdAt: -1 })
        .lean(),
      Hackathon.find({
        hackathonId: program._id,
        problem_statement_id: { $nin: [null, ""] },
      })
        .select("team_name lead_name problem_statement_id")
        .sort({ team_name: 1 })
        .lean(),
    ]);
    const teamsByStatement = new Map();
    for (const team of teams) {
      const list = teamsByStatement.get(team.problem_statement_id) || [];
      list.push({ team_name: team.team_name, lead_name: team.lead_name });
      teamsByStatement.set(team.problem_statement_id, list);
    }
    return res.json({
      statements: statements.map((statement) => ({
        ...statement,
        contactInfo: statement.contactInfo || DEFAULT_PROBLEM_STATEMENT_CONTACT_INFO,
        confirmedTeams: teamsByStatement.get(statement.id) || [],
      })),
      claimLimit: program.juryClaimLimit ?? 20,
      teamProposalLimit: TEAM_PROPOSAL_LIMIT,
    });
  } catch (error) {
    console.error("[admin/hackathons problem statements]", error);
    return res.status(500).json({ error: "Could not load problem statements." });
  }
});

router.post("/:hackathonId/problem-statements/:statementId/release", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const statement = await ProblemStatement.findOneAndUpdate(
      {
        hackathonId: program._id,
        id: String(req.params.statementId || "").trim().toUpperCase(),
        claimedBy: { $ne: null },
      },
      { $set: { claimedBy: null, claimedAt: null } },
      { new: true },
    );
    if (!statement) {
      return res.status(404).json({ error: "Claimed problem statement not found." });
    }
    return res.json({ ok: true, id: statement.id });
  } catch (error) {
    console.error("[admin/hackathons problem statement release]", error);
    return res.status(500).json({ error: "Could not release problem statement." });
  }
});

router.patch("/:hackathonId/jury-claim-limit", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const limit = Number(req.body?.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return res.status(400).json({ error: "Claim limit must be a whole number from 1 to 500." });
    }
    program.juryClaimLimit = limit;
    await program.save();
    return res.json({ claimLimit: program.juryClaimLimit });
  } catch (error) {
    console.error("[admin/hackathons jury claim limit]", error);
    return res.status(500).json({ error: "Could not update the claim limit." });
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
    const statementId = String(req.params.statementId || "").trim().toUpperCase();
    const countApprovedProposals = () =>
      ProblemStatement.countDocuments({
        hackathonId: program._id,
        proposedByTeam: { $ne: null },
        status: "active",
      });
    const slotsFullError = `All ${TEAM_PROPOSAL_LIMIT} team-proposed statements are already approved. Reject this one, or delete an approved team proposal first.`;

    const pending = await ProblemStatement.findOne({
      hackathonId: program._id,
      id: statementId,
      status: "pending_approval",
    })
      .select("proposedByTeam")
      .lean();
    if (!pending) {
      return res.status(404).json({ error: "Pending Problem Statement not found." });
    }
    if (action === "approve" && pending.proposedByTeam) {
      if ((await countApprovedProposals()) >= TEAM_PROPOSAL_LIMIT) {
        return res.status(409).json({ error: slotsFullError });
      }
      const team = await Hackathon.findOne({
        _id: pending.proposedByTeam,
        hackathonId: program._id,
      })
        .select("team_name problem_statement_id")
        .lean();
      if (!team) {
        return res
          .status(409)
          .json({ error: "The team that proposed this statement is no longer registered." });
      }
      if (team.problem_statement_id) {
        return res.status(409).json({
          error: `${team.team_name} has already confirmed ${team.problem_statement_id}. Reject this proposal instead.`,
        });
      }
    }

    const statement = await ProblemStatement.findOneAndUpdate(
      {
        hackathonId: program._id,
        id: statementId,
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
    )
      .populate("createdBy", "name")
      .populate("proposedByTeam", "team_name lead_name");
    if (!statement) {
      return res.status(404).json({ error: "Pending Problem Statement not found." });
    }

    if (action === "approve" && statement.proposedByTeam) {
      const revert = () =>
        ProblemStatement.updateOne(
          { _id: statement._id },
          { $set: { status: "pending_approval", reviewedBy: null, reviewedAt: null } },
        );
      if ((await countApprovedProposals()) > TEAM_PROPOSAL_LIMIT) {
        await revert();
        return res.status(409).json({ error: slotsFullError });
      }
      // Approving a team's own idea confirms it as that team's statement.
      const confirmed = await Hackathon.updateOne(
        {
          _id: statement.proposedByTeam._id,
          hackathonId: program._id,
          $or: [{ problem_statement_id: null }, { problem_statement_id: { $exists: false } }],
        },
        { $set: { problem_statement_id: statement.id } },
      );
      if (!confirmed.modifiedCount) {
        await revert();
        return res.status(409).json({
          error: "This team has just confirmed another statement. Reject this proposal instead.",
        });
      }
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
    const [memberships, totals] = await Promise.all([
      HackathonJuryMembership.find({ hackathonId: program._id })
        .populate("userId", "name email status createdAt")
        .sort({ acceptedAt: -1 })
        .lean(),
      teamRoundTotals(program._id),
    ]);
    const { teamCount } = totals;
    const items = await Promise.all(
      memberships.map(async (membership) => {
        const workload = membership.userId?._id
          ? await juryWorkload(program._id, membership.userId._id)
          : { claimedCount: 0, teamCount: 0, owed: 0, evaluated: 0, pending: 0 };
        return {
          id: String(membership._id),
          userId: membership.userId?._id,
          name: membership.userId?.name,
          email: membership.userId?.email,
          status: membership.status,
          accountStatus: membership.userId?.status,
          joinedAt: membership.acceptedAt,
          statementsClaimed: workload.claimedCount,
          teamsAssigned: workload.teamCount,
          teamsEvaluated: workload.evaluated,
          teamsPending: workload.pending,
          completionPercent: workload.owed
            ? Math.min(100, Math.round((workload.evaluated / workload.owed) * 100))
            : 0,
        };
      }),
    );
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
    return res.json(
      await buildHackathonLeaderboard(program._id, parseRound(req.query.round, 1)),
    );
  } catch (error) {
    console.error("[admin/hackathons leaderboard]", error);
    return res.status(500).json({ error: "Could not load leaderboard." });
  }
});

router.get("/:hackathonId/evaluations", async (req, res) => {
  try {
    const program = await loadAuthorizedProgram(req, res);
    if (!program) return;
    const round = parseRound(req.query.round, 1);
    const [evaluations, allTeams, memberships] = await Promise.all([
      HackathonJuryEvaluation.find({ hackathonId: program._id, round })
        .populate("juryMemberId", "name email")
        .lean(),
      Hackathon.find({ hackathonId: program._id, status: "active" })
        .select("team_name lead_name problem_statement_id round")
        .sort({ createdAt: 1 })
        .lean(),
      HackathonJuryMembership.find({
        hackathonId: program._id,
        status: "active",
      })
        .populate("userId", "name email")
        .lean(),
    ]);
    const maxRound = Math.max(1, ...allTeams.map(teamRound));
    const teams = allTeams.filter((team) => teamRound(team) >= round);
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
              round: teamRound(team),
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
      round,
      maxRound,
      result: round < MAX_EVALUATION_ROUNDS ? roundResultFor(program, round) : null,
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

async function loadRoundForResult(req, res) {
  const program = await loadAuthorizedProgram(req, res);
  if (!program) return null;
  const round = parseRound(req.params.round, 0);
  if (!round) {
    res.status(400).json({ error: "Invalid round." });
    return null;
  }
  if (round >= MAX_EVALUATION_ROUNDS) {
    res.status(400).json({
      error: `Round ${MAX_EVALUATION_ROUNDS} is the final round, so it has no cutoff.`,
    });
    return null;
  }
  return { program, round, result: roundResultFor(program, round) };
}

async function nextRoundStarted(program, round) {
  return Boolean(
    await HackathonJuryEvaluation.exists({ hackathonId: program._id, round: round + 1 }),
  );
}

/** Sets the qualifying score cutoff; teams are evaluated individually afterward. */
router.post("/:hackathonId/rounds/:round/cutoff", async (req, res) => {
  try {
    const context = await loadRoundForResult(req, res);
    if (!context) return;
    const { program, round, result } = context;
    const cutoff = Number(req.body?.cutoff);
    if (!Number.isFinite(cutoff) || cutoff < 0 || cutoff > 100) {
      return res.status(400).json({ error: "Cutoff must be a score from 0 to 100." });
    }
    if (result?.publishedAt) {
      return res.status(409).json({
        error: `Round ${round} results are published. Unpublish them before changing the cutoff.`,
      });
    }
    if (await nextRoundStarted(program, round)) {
      return res.status(409).json({
        error: `Round ${round + 1} scoring has already started, so the Round ${round} cutoff can't change.`,
      });
    }
    await Hackathon.updateMany(
      { hackathonId: program._id, round: round + 1 },
      { $set: { round } },
    );
    program.roundResults = [
      ...program.roundResults.filter((item) => item.round !== round),
      {
        round,
        cutoff,
        qualifiedCount: 0,
        disqualifiedCount: 0,
        evaluatedTeamIds: [],
        qualifiedTeamIds: [],
        decidedAt: new Date(),
        publishedAt: null,
      },
    ].sort((left, right) => left.round - right.round);
    await program.save();
    return res.json({ result: roundResultFor(program, round) });
  } catch (error) {
    console.error("[admin/hackathons round cutoff]", error);
    return res.status(500).json({ error: "Could not apply the cutoff." });
  }
});

/** Clears a round's cutoff and moves its teams back to that round. */
router.post("/:hackathonId/rounds/:round/teams/:teamId/evaluate", async (req, res) => {
  try {
    const context = await loadRoundForResult(req, res);
    if (!context) return;
    const { program, round, result } = context;
    if (!result) {
      return res.status(409).json({ error: `Set the Round ${round} cutoff before evaluating teams.` });
    }
    if (result.publishedAt) {
      return res.status(409).json({ error: `Unpublish Round ${round} results before evaluating teams.` });
    }
    if (!mongoose.isValidObjectId(req.params.teamId)) {
      return res.status(400).json({ error: "Invalid team." });
    }
    const team = await Hackathon.findOne({
      _id: req.params.teamId,
      hackathonId: program._id,
      status: "active",
    })
      .select("team_name lead_name problem_statement_id round")
      .lean();
    if (!team) return res.status(404).json({ error: "Team not found." });
    if (!team.problem_statement_id) {
      return res.status(409).json({ error: "The team must select a problem statement first." });
    }

    const board = await buildHackathonLeaderboard(program._id, round);
    const entry = board.items.find((item) => item.teamId === String(team._id));
    if (!entry || entry.averageScore === null) {
      return res.status(409).json({ error: "The Jury must score this team before evaluation." });
    }

    const roundResult = program.roundResults.find((item) => item.round === round);
    if (!Array.isArray(roundResult.evaluatedTeamIds)) {
      const legacyEvaluated = board.items.filter(
        (item) => item.qualification === "qualified",
      );
      roundResult.evaluatedTeamIds = legacyEvaluated.map((item) => item.teamId);
      roundResult.qualifiedTeamIds = legacyEvaluated
        .filter((item) => item.averageScore >= roundResult.cutoff)
        .map((item) => item.teamId);
    }
    if (roundResult.evaluatedTeamIds.some((id) => String(id) === String(team._id))) {
      return res.status(409).json({ error: "This team has already been evaluated." });
    }

    roundResult.evaluatedTeamIds.push(team._id);
    const qualified = entry.averageScore >= roundResult.cutoff;
    if (qualified) roundResult.qualifiedTeamIds.push(team._id);
    roundResult.qualifiedCount = roundResult.qualifiedTeamIds.length;
    roundResult.disqualifiedCount =
      roundResult.evaluatedTeamIds.length - roundResult.qualifiedCount;
    await Promise.all([
      program.save(),
      Hackathon.updateOne(
        { _id: team._id, hackathonId: program._id },
        { $set: { round: qualified ? round + 1 : round } },
      ),
    ]);
    return res.json({
      qualification: qualified ? "qualified" : "disqualified",
      result: roundResultFor(program, round),
    });
  } catch (error) {
    console.error("[admin/hackathons team evaluation]", error);
    return res.status(500).json({ error: "Could not evaluate the team." });
  }
});

router.delete("/:hackathonId/rounds/:round/cutoff", async (req, res) => {
  try {
    const context = await loadRoundForResult(req, res);
    if (!context) return;
    const { program, round, result } = context;
    if (!result) return res.status(404).json({ error: `Round ${round} has no cutoff yet.` });
    if (result.publishedAt) {
      return res
        .status(409)
        .json({ error: `Unpublish Round ${round} results before clearing the cutoff.` });
    }
    if (await nextRoundStarted(program, round)) {
      return res.status(409).json({
        error: `Round ${round + 1} scoring has already started, so the Round ${round} cutoff can't be cleared.`,
      });
    }
    await Hackathon.updateMany(
      { hackathonId: program._id, round: round + 1 },
      { $set: { round } },
    );
    program.roundResults = program.roundResults.filter((item) => item.round !== round);
    await program.save();
    return res.json({ ok: true });
  } catch (error) {
    console.error("[admin/hackathons round cutoff clear]", error);
    return res.status(500).json({ error: "Could not clear the cutoff." });
  }
});

/** Publishes (or hides) a round's qualified / disqualified results to the teams. */
router.post("/:hackathonId/rounds/:round/publish", async (req, res) => {
  try {
    const context = await loadRoundForResult(req, res);
    if (!context) return;
    const { program, round, result } = context;
    if (!result) {
      return res
        .status(409)
        .json({ error: `Apply a cutoff for Round ${round} before publishing results.` });
    }
    const published = req.body?.published !== false;
    const entry = program.roundResults.find((item) => item.round === round);
    entry.publishedAt = published ? new Date() : null;
    await program.save();
    return res.json({ result: roundResultFor(program, round) });
  } catch (error) {
    console.error("[admin/hackathons round publish]", error);
    return res.status(500).json({ error: "Could not update the results." });
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
