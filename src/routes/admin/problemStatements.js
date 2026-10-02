import express from "express";
import { ProblemStatement } from "../../models/ProblemStatement.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = express.Router();

router.use(requireAdmin);

// GET /api/admin/problem-statements
router.get("/", async (req, res) => {
  try {
    const items = await ProblemStatement.find({})
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    res.json({ ok: true, count: items.length, problemStatements: items });
  } catch (err) {
    console.error("[admin-problem-statements] Error listing:", err);
    res.status(500).json({ error: "Failed to list problem statements" });
  }
});

// POST /api/admin/problem-statements
router.post("/", async (req, res) => {
  try {
    const {
      title,
      slug,
      organization,
      department,
      targetDomain,
      difficulty,
      industry,
      scope,
      platformTech,
      description,
      keyDeliverables,
      published,
      sortOrder,
    } = req.body;

    if (!title || !description) {
      return res
        .status(400)
        .json({ error: "Title and description are required" });
    }

    const generatedSlug =
      slug ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

    const existing = await ProblemStatement.findOne({ slug: generatedSlug });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Problem statement with this slug already exists" });
    }

    const newItem = await ProblemStatement.create({
      title,
      slug: generatedSlug,
      organization: organization || "",
      department: department || "",
      targetDomain: targetDomain || "",
      difficulty: difficulty || "Advanced",
      industry: industry || "",
      scope: scope || "",
      platformTech: platformTech || "",
      description,
      keyDeliverables: Array.isArray(keyDeliverables) ? keyDeliverables : [],
      published: published !== undefined ? published : true,
      sortOrder: sortOrder || 0,
    });

    res.status(201).json({ ok: true, problemStatement: newItem });
  } catch (err) {
    console.error("[admin-problem-statements] Create error:", err);
    res.status(500).json({ error: "Failed to create problem statement" });
  }
});

// PUT /api/admin/problem-statements/:id
router.put("/:id", async (req, res) => {
  try {
    const updated = await ProblemStatement.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Problem statement not found" });
    }

    res.json({ ok: true, problemStatement: updated });
  } catch (err) {
    console.error("[admin-problem-statements] Update error:", err);
    res.status(500).json({ error: "Failed to update problem statement" });
  }
});

// DELETE /api/admin/problem-statements/:id
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await ProblemStatement.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Problem statement not found" });
    }
    res.json({ ok: true, message: "Problem statement deleted successfully" });
  } catch (err) {
    console.error("[admin-problem-statements] Delete error:", err);
    res.status(500).json({ error: "Failed to delete problem statement" });
  }
});

export default router;
