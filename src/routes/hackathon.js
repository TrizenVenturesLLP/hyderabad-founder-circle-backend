import { Router } from "express";
import { Hackathon } from "../models/Hackathon.js";
import multer from "multer";
import { HackathonSettings } from "../models/HackathonSettings.js";
import { ProblemStatement } from "../models/ProblemStatement.js";
import mongoose from "mongoose";
import { sendHackathonTeamInvitations } from "../services/emailNotification.js";

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

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function findParticipantTeam(email, phone) {
  const normalizedPhone = normalizePhone(phone);
  const teams = await Hackathon.find({
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

hackathonRouter.post("/register", async (req, res) => {
  try {
    const { team_name, lead_name, email, phone, members } = req.body;

    if (
      !team_name?.trim() ||
      !lead_name?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !Array.isArray(members) ||
      members.length < 1 ||
      members.length > 4
    ) {
      return res.status(400).json({
        message: "Please provide valid team and member details.",
      });
    }

    const existingTeam = await Hackathon.findOne({
      email: email.toLowerCase(),
    });

    if (existingTeam) {
      return res.status(403).json({
        message: "Team Lead is already registered. Please login.",
      });
    }

    const team = await Hackathon.create({
      team_name: team_name.trim(),
      lead_name: lead_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      members,
    });

    const invitations = await sendHackathonTeamInvitations({
      team,
      members: team.members,
    });
    const invitationMessage = invitations.attempted
      ? invitations.failed
        ? ` Invitations sent to ${invitations.sent} of ${invitations.attempted} team members.`
        : ` Invitation emails sent to ${invitations.sent} team members.`
      : "";

    return res.status(201).json({
      message: `Team registration is successful.${invitationMessage}`,
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

hackathonRouter.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();

    if (!email || !phone) {
      return res.status(400).json({ message: "Email and mobile number are required." });
    }

    const team = await findParticipantTeam(email, phone);

    if (!team) {
      return res.status(401).json({
        message: "Invalid email or mobile number",
      });
    }

    const isTeamLead =
      team.email === email && normalizePhone(team.phone) === normalizePhone(phone);
    const member = team.members.find(
      (entry) => entry.email === email && normalizePhone(entry.phone) === normalizePhone(phone),
    );

    return res.status(200).json({
      message: "Login is successful",
      team,
      profile: {
        name: isTeamLead ? team.lead_name : member.full_name,
        email,
        phone,
        role: isTeamLead ? "lead" : "member",
      },
    });
  } catch (error) {
    console.error("Hackathon login error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
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

    return res.status(200).json({ message: "User found", user });
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

    const team = await Hackathon.findOne({ email: leadEmail, phone: leadPhone });
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

    if (team.members.length >= 4) {
      return res.status(409).json({ message: "Teams can have up to four members." });
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

    const team = await Hackathon.findOne({ email: leadEmail, phone: leadPhone });
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
    const { phone, email, problem_statement_id } = req.body;

    if (!problem_statement_id) {
      return res
        .status(400)
        .json({ message: "Problem statement ID is required" });
    }

    // Find the user and update their problem statement in one step
    const user = await Hackathon.findOneAndUpdate(
      { phone, email },
      { $set: { problem_statement_id } },
      { new: true }, // Returns the newly updated document
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Problem statement confirmed successfully",
      user,
    });
  } catch (error) {
    console.error("Confirmation error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

hackathonRouter.get("/users", async (req, res) => {
  try {
    const users = await Hackathon.find({});

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

hackathonRouter.patch("/users/:id/evaluation", async (req, res) => {
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

    const user = await Hackathon.findById(req.params.id);

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

    const user = await Hackathon.findOneAndUpdate(
      { email, phone },
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

hackathonRouter.get("/ppt/:fileId", async (req, res) => {
  try {
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

hackathonRouter.patch("/users/:id/suspend", async (req, res) => {
  try {
    const user = await Hackathon.findByIdAndUpdate(
      req.params.id,
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

hackathonRouter.patch("/users/:id/activate", async (req, res) => {
  try {
    const user = await Hackathon.findByIdAndUpdate(
      req.params.id,
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

hackathonRouter.delete("/users/:id", async (req, res) => {
  try {
    const user = await Hackathon.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "Team not found",
      });
    }

    return res.status(200).json({
      message: "Team removed successfully",
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
hackathonRouter.put("/release-timer", async (req, res) => {
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
hackathonRouter.delete("/release-timer", async (req, res) => {
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
    const statements = await ProblemStatement.find().sort({ createdAt: -1 });

    return res.status(200).json({
      statements,
    });
  } catch (error) {
    console.error("Get problem statements error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

// Create or update a problem statement
hackathonRouter.post("/problem-statements", async (req, res) => {
  try {
    const {
      id,
      domainId,
      title,
      category,
      difficulty,
      description,
      deliverables,
    } = req.body;

    if (!id || !domainId || !title || !description) {
      return res.status(400).json({
        message: "id, domainId, title and description are required.",
      });
    }

    const statement = await ProblemStatement.findOneAndUpdate(
      { id: id.trim().toUpperCase() },
      {
        id: id.trim().toUpperCase(),
        domainId,
        title: title.trim(),
        category: category?.trim() || "General",
        difficulty: difficulty || "Intermediate",
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
hackathonRouter.delete("/problem-statements/:id", async (req, res) => {
  try {
    const statement = await ProblemStatement.findOneAndDelete({
      id: req.params.id.toUpperCase(),
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
