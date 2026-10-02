import express from "express";
import { ProblemStatement } from "../models/ProblemStatement.js";

const router = express.Router();

// GET all published problem statements
router.get("/", async (req, res) => {
  try {
    const items = await ProblemStatement.find({ published: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    res.json({ ok: true, count: items.length, problemStatements: items });
  } catch (err) {
    console.error("[problem-statements] Error listing:", err);
    res.status(500).json({ error: "Failed to load problem statements" });
  }
});

// GET single problem statement by slug
router.get("/:slug", async (req, res) => {
  try {
    const item = await ProblemStatement.findOne({
      slug: req.params.slug.toLowerCase(),
      published: true,
    }).lean();

    if (!item) {
      return res.status(404).json({ error: "Problem statement not found" });
    }

    res.json({ ok: true, problemStatement: item });
  } catch (err) {
    console.error("[problem-statements] Error fetching:", err);
    res.status(500).json({ error: "Failed to fetch problem statement" });
  }
});

export default router;
