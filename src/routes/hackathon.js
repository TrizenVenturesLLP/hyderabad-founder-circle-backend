import { Router } from "express";
import { Hackathon } from "../models/Hackathon.js";
import multer from "multer";
import { HackathonSettings } from "../models/HackathonSettings.js";
import { ProblemStatement } from "../models/ProblemStatement.js";
import mongoose from "mongoose";

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

    return res.status(201).json({
      message: "Team registration is successful",
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
    const { email, phone } = req.body;

    const team = await Hackathon.findOne({
      email,
      phone,
    });

    if (!team) {
      return res.status(401).json({
        message: "Invalid email or mobile number",
      });
    }

    return res.status(200).json({
      message: "Login is successful",
      team,
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
    const { phone, email } = req.body;

    const user = await Hackathon.findOne({ phone, email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User found", user });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
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
