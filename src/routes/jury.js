import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { Hackathon } from "../models/Hackathon.js";
import { JuryUser } from "../models/JuryUser.js";
import { HackathonJuryInvitation } from "../models/HackathonJuryInvitation.js";
import { HackathonJuryMembership } from "../models/HackathonJuryMembership.js";
import { HackathonJuryEvaluation } from "../models/HackathonJuryEvaluation.js";
import { ProblemStatement } from "../models/ProblemStatement.js";
import { buildHackathonLeaderboard } from "../services/hackathonLeaderboard.js";
import {
  requireJury,
  signJuryToken,
  signSubmissionViewToken,
  verifySubmissionViewToken,
} from "../middleware/auth.js";

const router = Router();
const DEFAULT_HACKATHON_SLUG = "ai-hack-x-mrdu-2026";
const ALLOWED_DOMAINS = new Set([
  "ui-ux",
  "web-dev",
  "vibe-coding",
  "agentic-ai",
]);

class InvitationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizedEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

const LIVE_STATEMENT_FILTER = {
  $or: [{ status: "active" }, { status: { $exists: false } }],
};

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email };
}

function maskEmail(email) {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

async function lookupInvitation(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 200) {
    throw new InvitationError(400, "Invitation token is invalid.");
  }
  const invitation = await HackathonJuryInvitation.findOne({
    tokenHash: hashToken(token),
  });
  if (!invitation)
    throw new InvitationError(
      404,
      "Invitation is invalid or no longer available.",
    );
  if (invitation.status === "pending" && invitation.expiresAt <= new Date()) {
    invitation.status = "expired";
    await invitation.save();
  }
  if (invitation.status !== "pending") {
    const messages = {
      accepted: "Invitation has already been accepted.",
      revoked: "Invitation has been revoked.",
      expired: "Invitation has expired.",
    };
    throw new InvitationError(
      410,
      messages[invitation.status] || "Invitation is unavailable.",
    );
  }
  const program = await HackathonProgram.findById(
    invitation.hackathonId,
  ).select("name slug status");
  if (!program) throw new InvitationError(404, "Hackathon was not found.");
  return { invitation, program };
}

async function acceptInvitation(invitationId, user, session) {
  const invitation = await HackathonJuryInvitation.findOneAndUpdate(
    { _id: invitationId, status: "pending", expiresAt: { $gt: new Date() } },
    {
      $set: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedBy: user._id,
      },
    },
    { new: true, session },
  );
  if (!invitation)
    throw new InvitationError(
      410,
      "Invitation is expired, revoked, or already accepted.",
    );

  const priorMembership = await HackathonJuryMembership.findOne({
    hackathonId: invitation.hackathonId,
    userId: user._id,
  }).session(session);
  if (priorMembership?.status === "active") {
    throw new InvitationError(409, "Jury membership already exists.");
  }
  if (priorMembership) {
    priorMembership.status = "active";
    priorMembership.invitedAt = invitation.createdAt;
    priorMembership.acceptedAt = new Date();
    await priorMembership.save({ session });
    return priorMembership;
  }
  const [membership] = await HackathonJuryMembership.create(
    [
      {
        hackathonId: invitation.hackathonId,
        userId: user._id,
        status: "active",
        invitedAt: invitation.createdAt,
        acceptedAt: new Date(),
      },
    ],
    { session },
  );
  return membership;
}

async function runTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function loadProgramAndMembership(req, res) {
  const reference = String(req.params.hackathonId || "").trim();
  const program = mongoose.Types.ObjectId.isValid(reference)
    ? await HackathonProgram.findById(reference)
    : await HackathonProgram.findOne({ slug: reference.toLowerCase() });
  if (!program) {
    res.status(404).json({ error: "Hackathon not found." });
    return null;
  }
  const membership = await HackathonJuryMembership.findOne({
    hackathonId: program._id,
    userId: req.juryUser.id,
    status: "active",
  });
  if (!membership) {
    res
      .status(403)
      .json({ error: "Active Jury membership required for this Hackathon." });
    return null;
  }
  return program;
}

async function loadTeam(program, teamId) {
  if (!mongoose.Types.ObjectId.isValid(teamId)) return null;
  return Hackathon.findOne({
    _id: teamId,
    hackathonId: program._id,
    status: "active",
  });
}

function teamSummary(team) {
  const members = [
    ...new Set(
      [
        team.lead_name,
        ...(team.members || []).map((member) => member.full_name),
      ]
        .map((name) => String(name || "").trim())
        .filter(Boolean),
    ),
  ];
  return {
    id: String(team._id),
    teamName: team.team_name,
    members,
    problemStatementId: team.problem_statement_id,
    submission: {
      description: team.submission?.description || "",
      githubRepo: team.submission?.github_repo || "",
      videoUrl: team.submission?.video_url || "",
      submittedAt: team.submission?.submitted_at || null,
      hasFile: Boolean(team.submission?.ppt_url),
    },
  };
}

async function loadGridFsFile(team) {
  const match = String(team.submission?.ppt_url || "").match(
    /\/api\/hackathon\/ppt\/([a-f\d]{24})$/i,
  );
  if (!match) return null;
  const db = mongoose.connection.db;
  if (!db) return null;
  const fileId = new mongoose.Types.ObjectId(match[1]);
  const files = await db
    .collection("hackathon_ppts.files")
    .find({ _id: fileId })
    .toArray();
  if (!files.length) return null;
  const metadata = files[0].metadata || {};
  const sameEmail =
    normalizedEmail(metadata.email) === normalizedEmail(team.email);
  const samePhone =
    String(metadata.phone || "").replace(/\D/g, "") ===
    String(team.phone || "").replace(/\D/g, "");
  return sameEmail && samePhone ? { file: files[0], fileId, db } : null;
}

router.post("/invitations/validate", async (req, res) => {
  try {
    const { invitation, program } = await lookupInvitation(req.body?.token);
    return res.json({
      status: "pending",
      emailHint: maskEmail(invitation.email),
      expiresAt: invitation.expiresAt,
      hackathon: { name: program.name, slug: program.slug },
    });
  } catch (error) {
    if (error instanceof InvitationError)
      return res.status(error.status).json({ error: error.message });
    console.error("[jury/invitation validate]", error);
    return res.status(500).json({ error: "Could not validate invitation." });
  }
});

router.post("/auth/signup", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  let context;
  try {
    context = await lookupInvitation(req.body?.token);
    if (name.length < 2 || name.length > 120) {
      return res
        .status(400)
        .json({ error: "Name must be between 2 and 120 characters." });
    }
    if (password.length < 8 || password.length > 128) {
      return res
        .status(400)
        .json({ error: "Password must be between 8 and 128 characters." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await runTransaction(async (session) => {
      const existing = await JuryUser.findOne({
        normalizedEmail: context.invitation.normalizedEmail,
      }).session(session);
      if (existing) {
        const hasAccess =
          existing.status === "active" &&
          (await HackathonJuryMembership.exists({
            userId: existing._id,
            status: "active",
          }).session(session));
        if (hasAccess) {
          throw new InvitationError(
            409,
            "An account already exists. Sign in to accept this invitation.",
          );
        }
        existing.name = name;
        existing.passwordHash = passwordHash;
        existing.status = "active";
        existing.emailVerified = true;
        await existing.save({ session });
        await acceptInvitation(context.invitation._id, existing, session);
        return existing;
      }
      const [created] = await JuryUser.create(
        [
          {
            email: context.invitation.email,
            normalizedEmail: context.invitation.normalizedEmail,
            name,
            passwordHash,
            status: "active",
            emailVerified: true,
          },
        ],
        { session },
      );
      await acceptInvitation(context.invitation._id, created, session);
      return created;
    });
    return res
      .status(201)
      .json({ token: signJuryToken(user), user: publicUser(user) });
  } catch (error) {
    if (error instanceof InvitationError)
      return res.status(error.status).json({ error: error.message });
    if (error?.code === 11000)
      return res
        .status(409)
        .json({
          error:
            "An account already exists. Sign in to accept this invitation.",
        });
    console.error("[jury/signup]", error);
    return res
      .status(500)
      .json({ error: "Could not create Jury account. Please retry." });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = normalizedEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password)
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    const user = await JuryUser.findOne({ normalizedEmail: email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const hasAccess =
      user.status === "active" &&
      (await HackathonJuryMembership.exists({
        userId: user._id,
        status: "active",
      }));
    if (!hasAccess) {
      return res.status(403).json({
        error:
          "Your Jury access has been removed. Contact the organizers if this is a mistake.",
      });
    }
    return res.json({ token: signJuryToken(user), user: publicUser(user) });
  } catch (error) {
    console.error("[jury/login]", error);
    return res.status(500).json({ error: "Login failed." });
  }
});

function streamSubmissionFile(res, stored) {
  const bucket = new mongoose.mongo.GridFSBucket(stored.db, {
    bucketName: "hackathon_ppts",
  });
  res.set("Content-Type", stored.file.contentType || "application/octet-stream");
  res.set(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(stored.file.filename || "submission")}`,
  );
  return bucket.openDownloadStream(stored.fileId).pipe(res);
}

router.get("/submission-view/:token/:filename?", async (req, res) => {
  try {
    const payload = verifySubmissionViewToken(req.params.token);
    if (!payload || !mongoose.Types.ObjectId.isValid(payload.teamId))
      return res.status(401).json({ error: "This preview link has expired." });
    const team = await Hackathon.findOne({
      _id: payload.teamId,
      hackathonId: payload.hackathonId,
      status: "active",
    });
    const stored = team ? await loadGridFsFile(team) : null;
    if (!stored || String(stored.fileId) !== payload.fileId)
      return res.status(404).json({ error: "Submission file not found." });
    res.set("Cache-Control", "private, no-store");
    return streamSubmissionFile(res, stored);
  } catch (error) {
    console.error("[jury/submission view]", error);
    return res.status(500).json({ error: "Unable to retrieve submission file." });
  }
});

router.use(requireJury);

router.get("/auth/me", async (req, res) => {
  return res.json({ user: req.juryUser });
});

router.post("/invitations/accept", async (req, res) => {
  try {
    const { invitation } = await lookupInvitation(req.body?.token);
    if (invitation.normalizedEmail !== normalizedEmail(req.juryUser.email)) {
      return res
        .status(403)
        .json({
          error: "Sign in with the email address this invitation was sent to.",
        });
    }
    const membership = await runTransaction(async (session) => {
      const user = await JuryUser.findById(req.juryUser.id).session(session);
      if (!user || user.status !== "active")
        throw new InvitationError(401, "Jury account is unavailable.");
      return acceptInvitation(invitation._id, user, session);
    });
    return res.json({
      membership: {
        id: String(membership._id),
        hackathonId: String(membership.hackathonId),
        status: membership.status,
      },
    });
  } catch (error) {
    if (error instanceof InvitationError)
      return res.status(error.status).json({ error: error.message });
    if (error?.code === 11000)
      return res.status(409).json({ error: "Jury membership already exists." });
    console.error("[jury/invitation accept]", error);
    return res.status(500).json({ error: "Could not accept invitation." });
  }
});

router.get("/hackathons", async (req, res) => {
  try {
    const memberships = await HackathonJuryMembership.find({
      userId: req.juryUser.id,
      status: "active",
    }).lean();
    const items = await Promise.all(
      memberships.map(async (membership) => {
        const program = await HackathonProgram.findById(
          membership.hackathonId,
        ).lean();
        if (!program) return null;
        const [teamCount, statementCount, evaluatedCount] = await Promise.all([
          Hackathon.countDocuments({
            hackathonId: program._id,
            status: "active",
          }),
          ProblemStatement.countDocuments({
            hackathonId: program._id,
            ...LIVE_STATEMENT_FILTER,
          }),
          HackathonJuryEvaluation.countDocuments({
            hackathonId: program._id,
            juryMemberId: req.juryUser.id,
            status: "submitted",
          }),
        ]);
        return {
          id: String(program._id),
          name: program.name,
          slug: program.slug,
          description: program.description,
          status: program.status,
          startDate: program.startDate,
          endDate: program.endDate,
          teamCount,
          statementCount,
          evaluatedCount,
          pendingEvaluations: Math.max(0, teamCount - evaluatedCount),
        };
      }),
    );
    return res.json({ items: items.filter(Boolean) });
  } catch (error) {
    console.error("[jury/hackathons]", error);
    return res
      .status(500)
      .json({ error: "Could not load assigned Hackathons." });
  }
});

router.get("/hackathons/:hackathonId", async (req, res) => {
  try {
    const program = await loadProgramAndMembership(req, res);
    if (!program) return;
    const [teamCount, statementCount, evaluatedCount] = await Promise.all([
      Hackathon.countDocuments({ hackathonId: program._id, status: "active" }),
      ProblemStatement.countDocuments({
        hackathonId: program._id,
        ...LIVE_STATEMENT_FILTER,
      }),
      HackathonJuryEvaluation.countDocuments({
        hackathonId: program._id,
        juryMemberId: req.juryUser.id,
        status: "submitted",
      }),
    ]);
    return res.json({
      hackathon: {
        id: String(program._id),
        name: program.name,
        slug: program.slug,
        description: program.description,
        status: program.status,
        startDate: program.startDate,
        endDate: program.endDate,
        rubric: program.rubric,
        teamCount,
        statementCount,
        evaluatedCount,
        pendingEvaluations: Math.max(0, teamCount - evaluatedCount),
      },
    });
  } catch (error) {
    console.error("[jury/hackathon]", error);
    return res.status(500).json({ error: "Could not load Hackathon." });
  }
});

router.get("/hackathons/:hackathonId/leaderboard", async (req, res) => {
  try {
    const program = await loadProgramAndMembership(req, res);
    if (!program) return;
    const leaderboard = await buildHackathonLeaderboard(program._id);
    return res.json({
      requiredEvaluations: leaderboard.requiredEvaluations,
      items: leaderboard.items.map((entry) => ({
        teamId: entry.teamId,
        teamName: entry.teamName,
        submittedEvaluations: entry.submittedEvaluations,
        totalJuryMembers: entry.totalJuryMembers,
        averageScore: entry.averageScore,
        rank: entry.rank,
      })),
    });
  } catch (error) {
    console.error("[jury/leaderboard]", error);
    return res.status(500).json({ error: "Could not load Hackathon leaderboard." });
  }
});

router.get("/hackathons/:hackathonId/problem-statements", async (req, res) => {
  try {
    const program = await loadProgramAndMembership(req, res);
    if (!program) return;
    const statements = await ProblemStatement.find({
      hackathonId: program._id,
      $or: [
        ...LIVE_STATEMENT_FILTER.$or,
        { createdBy: req.juryUser.id },
      ],
    })
      .select("-reviewedBy")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      statements: statements.map((statement) => ({
        ...statement,
        status: statement.status || "active",
        createdByMe: String(statement.createdBy?._id || "") === req.juryUser.id,
      })),
    });
  } catch (error) {
    console.error("[jury/problem statements]", error);
    return res
      .status(500)
      .json({ error: "Could not load problem statements." });
  }
});

router.post("/hackathons/:hackathonId/problem-statements", async (req, res) => {
  try {
    const program = await loadProgramAndMembership(req, res);
    if (!program) return;
    const { title, category, difficulty, description } = req.body || {};
    const domainId = String(req.body?.domainId || "").trim();
    const deliverables = req.body?.deliverables;
    const industry = String(req.body?.industry || "").trim();
    const scope = String(req.body?.scope || "").trim();
    const platform = String(req.body?.platform || "").trim();
    if (industry.length > 120 || platform.length > 200 || scope.length > 3000) {
      return res.status(400).json({
        error: "Industry, scope, or platform/tech exceeds the allowed length.",
      });
    }
    if (
      !ALLOWED_DOMAINS.has(domainId) ||
      !String(title || "").trim() ||
      !String(description || "").trim()
    ) {
      return res
        .status(400)
        .json({ error: "Valid domain, title, and description are required." });
    }
    if (
      String(title).trim().length > 200 ||
      String(description).trim().length > 10000
    ) {
      return res
        .status(400)
        .json({ error: "Title or description exceeds the allowed length." });
    }
    if (
      difficulty &&
      !["Beginner", "Intermediate", "Advanced"].includes(difficulty)
    ) {
      return res.status(400).json({ error: "Difficulty is invalid." });
    }
    if (
      deliverables !== undefined &&
      (!Array.isArray(deliverables) ||
        deliverables.length > 30 ||
        deliverables.some(
          (item) => typeof item !== "string" || item.length > 500,
        ))
    ) {
      return res
        .status(400)
        .json({
          error: "Deliverables must be a list of at most 30 short text values.",
        });
    }
    const id = `JY-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const statement = await ProblemStatement.create({
      hackathonId: program._id,
      createdBy: req.juryUser.id,
      status: "pending_approval",
      id,
      domainId,
      title: String(title).trim(),
      category:
        String(category || "General")
          .trim()
          .slice(0, 100) || "General",
      difficulty: difficulty || "Intermediate",
      industry,
      scope,
      platform,
      description: String(description).trim(),
      deliverables: (deliverables || [])
        .map((item) => item.trim())
        .filter(Boolean),
    });
    return res.status(201).json({ statement });
  } catch (error) {
    if (error?.code === 11000)
      return res
        .status(409)
        .json({
          error: "Could not allocate a unique problem statement ID; retry.",
        });
    console.error("[jury/problem statement create]", error);
    return res
      .status(500)
      .json({ error: "Could not create problem statement." });
  }
});

router.get("/hackathons/:hackathonId/teams", async (req, res) => {
  try {
    const program = await loadProgramAndMembership(req, res);
    if (!program) return;
    const [teams, evaluations] = await Promise.all([
      Hackathon.find({ hackathonId: program._id, status: "active" })
        .sort({ createdAt: 1 })
        .lean(),
      HackathonJuryEvaluation.find({
        hackathonId: program._id,
        juryMemberId: req.juryUser.id,
      })
        .select("teamId status totalScore")
        .lean(),
    ]);
    const evaluationByTeam = new Map(
      evaluations.map((evaluation) => [String(evaluation.teamId), evaluation]),
    );
    return res.json({
      items: teams.map((team) => {
        const evaluation = evaluationByTeam.get(String(team._id));
        return {
          ...teamSummary(team),
          evaluationStatus: evaluation?.status || "pending",
          totalScore: evaluation ? evaluation.totalScore : null,
        };
      }),
    });
  } catch (error) {
    console.error("[jury/teams]", error);
    return res.status(500).json({ error: "Could not load teams." });
  }
});

router.get("/hackathons/:hackathonId/teams/:teamId", async (req, res) => {
  try {
    const program = await loadProgramAndMembership(req, res);
    if (!program) return;
    const team = await loadTeam(program, req.params.teamId);
    if (!team)
      return res
        .status(404)
        .json({ error: "Team not found in this Hackathon." });
    const statement = team.problem_statement_id
      ? await ProblemStatement.findOne({
          hackathonId: program._id,
          id: team.problem_statement_id,
        })
          .select(
            "id domainId title category difficulty industry scope platform description deliverables",
          )
          .lean()
      : null;
    return res.json({ team: teamSummary(team), problemStatement: statement });
  } catch (error) {
    console.error("[jury/team detail]", error);
    return res.status(500).json({ error: "Could not load team details." });
  }
});

router.get(
  "/hackathons/:hackathonId/teams/:teamId/submission",
  async (req, res) => {
    try {
      const program = await loadProgramAndMembership(req, res);
      if (!program) return;
      const team = await loadTeam(program, req.params.teamId);
      if (!team)
        return res
          .status(404)
          .json({ error: "Team not found in this Hackathon." });
      const stored = await loadGridFsFile(team);
      if (!stored)
        return res.status(404).json({ error: "Submission file not found." });
      return streamSubmissionFile(res, stored);
    } catch (error) {
      console.error("[jury/submission file]", error);
      return res
        .status(500)
        .json({ error: "Unable to retrieve submission file." });
    }
  },
);

router.post(
  "/hackathons/:hackathonId/teams/:teamId/submission/view-link",
  async (req, res) => {
    try {
      const program = await loadProgramAndMembership(req, res);
      if (!program) return;
      const team = await loadTeam(program, req.params.teamId);
      if (!team)
        return res
          .status(404)
          .json({ error: "Team not found in this Hackathon." });
      const stored = await loadGridFsFile(team);
      if (!stored)
        return res.status(404).json({ error: "Submission file not found." });
      const filename = stored.file.filename || "submission";
      const token = signSubmissionViewToken({
        hackathonId: program._id,
        teamId: team._id,
        fileId: stored.fileId,
      });
      return res.json({
        path: `/api/jury/submission-view/${token}/${encodeURIComponent(filename)}`,
        filename,
        contentType: stored.file.contentType || "application/octet-stream",
        expiresInSeconds: 600,
      });
    } catch (error) {
      console.error("[jury/submission view-link]", error);
      return res
        .status(500)
        .json({ error: "Unable to prepare submission preview." });
    }
  },
);

async function loadEvaluationContext(req, res) {
  const program = await loadProgramAndMembership(req, res);
  if (!program) return null;
  const team = await loadTeam(program, req.params.teamId);
  if (!team) {
    res.status(404).json({ error: "Team not found in this Hackathon." });
    return null;
  }
  const criteria = program.rubric
    .filter((criterion) => criterion.active)
    .sort((a, b) => a.order - b.order);
  if (
    !criteria.length ||
    criteria.reduce((sum, criterion) => sum + criterion.maxMarks, 0) !== 100
  ) {
    res
      .status(409)
      .json({ error: "Hackathon rubric is not configured to 100 marks." });
    return null;
  }
  return { program, team, criteria };
}

function validateScores(value, criteria, requireComplete) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { error: "Criteria scores are required." };
  const criterionById = new Map(
    criteria.map((criterion) => [criterion.id, criterion]),
  );
  const keys = Object.keys(value);
  if (keys.some((key) => !criterionById.has(key)))
    return { error: "Unknown rubric criterion." };
  if (
    requireComplete &&
    criteria.some(
      (criterion) => !Object.prototype.hasOwnProperty.call(value, criterion.id),
    )
  ) {
    return { error: "A score is required for every active criterion." };
  }
  const criteriaScores = [];
  for (const [criterionId, score] of Object.entries(value)) {
    const criterion = criterionById.get(criterionId);
    if (!Number.isInteger(score) || score < 0 || score > criterion.maxMarks) {
      return {
        error: `Score for ${criterion.name} must be an integer from 0 to ${criterion.maxMarks}.`,
      };
    }
    criteriaScores.push({ criterionId, score });
  }
  return {
    criteriaScores,
    totalScore: criteriaScores.reduce((sum, item) => sum + item.score, 0),
  };
}

router.get(
  "/hackathons/:hackathonId/teams/:teamId/evaluation",
  async (req, res) => {
    try {
      const context = await loadEvaluationContext(req, res);
      if (!context) return;
      const evaluation = await HackathonJuryEvaluation.findOne({
        hackathonId: context.program._id,
        teamId: context.team._id,
        juryMemberId: req.juryUser.id,
      }).lean();
      return res.json({
        evaluation: evaluation || null,
        rubric: context.criteria,
      });
    } catch (error) {
      console.error("[jury/evaluation get]", error);
      return res.status(500).json({ error: "Could not load evaluation." });
    }
  },
);

router.put(
  "/hackathons/:hackathonId/teams/:teamId/evaluation",
  async (req, res) => {
    try {
      const context = await loadEvaluationContext(req, res);
      if (!context) return;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "totalScore")) {
        return res
          .status(400)
          .json({ error: "Total score is calculated by the server." });
      }
      if (req.body?.status && req.body.status !== "draft") {
        return res
          .status(400)
          .json({ error: "Use the submit endpoint to submit an evaluation." });
      }
      const comments = req.body?.comments ?? "";
      if (typeof comments !== "string" || comments.length > 3000) {
        return res
          .status(400)
          .json({ error: "Comments must be text up to 3000 characters." });
      }
      const scores = validateScores(
        req.body?.criteriaScores,
        context.criteria,
        false,
      );
      if (scores.error) return res.status(400).json({ error: scores.error });
      const evaluation = await HackathonJuryEvaluation.findOneAndUpdate(
        {
          hackathonId: context.program._id,
          teamId: context.team._id,
          juryMemberId: req.juryUser.id,
          status: { $ne: "submitted" },
        },
        {
          $set: {
            rubricVersion: context.program.rubricVersion,
            criteriaScores: scores.criteriaScores,
            totalScore: scores.totalScore,
            comments: comments.trim(),
            status: "draft",
            submittedAt: null,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      );
      return res.json({ evaluation });
    } catch (error) {
      if (error?.code === 11000)
        return res
          .status(409)
          .json({
            error:
              "This evaluation is already submitted. Use Edit score to update it.",
          });
      console.error("[jury/evaluation save]", error);
      return res
        .status(500)
        .json({ error: "Could not save evaluation draft." });
    }
  },
);

router.post(
  "/hackathons/:hackathonId/teams/:teamId/evaluation/submit",
  async (req, res) => {
    try {
      const context = await loadEvaluationContext(req, res);
      if (!context) return;
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, "criteriaScores")
      ) {
        const comments = req.body.comments ?? "";
        if (typeof comments !== "string" || comments.length > 3000) {
          return res
            .status(400)
            .json({ error: "Comments must be text up to 3000 characters." });
        }
        const scores = validateScores(
          req.body.criteriaScores,
          context.criteria,
          true,
        );
        if (scores.error) return res.status(400).json({ error: scores.error });
        const evaluation = await HackathonJuryEvaluation.findOneAndUpdate(
          {
            hackathonId: context.program._id,
            teamId: context.team._id,
            juryMemberId: req.juryUser.id,
          },
          {
            $set: {
              rubricVersion: context.program.rubricVersion,
              criteriaScores: scores.criteriaScores,
              totalScore: scores.totalScore,
              comments: comments.trim(),
              status: "submitted",
              submittedAt: new Date(),
            },
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        );
        return res.json({ evaluation });
      }
      const evaluation = await HackathonJuryEvaluation.findOne({
        hackathonId: context.program._id,
        teamId: context.team._id,
        juryMemberId: req.juryUser.id,
      });
      if (!evaluation)
        return res
          .status(409)
          .json({ error: "Save an evaluation draft before submitting." });
      if (evaluation.status === "submitted")
        return res
          .status(409)
          .json({ error: "Evaluation is already submitted." });
      const submittedScores = Object.fromEntries(
        evaluation.criteriaScores.map((item) => [item.criterionId, item.score]),
      );
      const scores = validateScores(submittedScores, context.criteria, true);
      if (scores.error) return res.status(400).json({ error: scores.error });
      evaluation.criteriaScores = scores.criteriaScores;
      evaluation.totalScore = scores.totalScore;
      evaluation.rubricVersion = context.program.rubricVersion;
      evaluation.status = "submitted";
      evaluation.submittedAt = new Date();
      await evaluation.save();
      return res.json({ evaluation });
    } catch (error) {
      if (error?.code === 11000)
        return res
          .status(409)
          .json({ error: "Another save is in progress. Please try again." });
      console.error("[jury/evaluation submit]", error);
      return res.status(500).json({ error: "Could not submit evaluation." });
    }
  },
);

export default router;
