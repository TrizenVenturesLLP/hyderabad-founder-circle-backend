import { Router } from "express";
import { Event } from "../models/Event.js";

const router = Router();

/** Public: list published events for the website. */
router.get("/", async (_req, res) => {
  try {
    const items = await Event.find({ published: true })
      .sort({ sortOrder: 1, dateISO: 1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    console.error("[events GET]", err);
    return res.status(500).json({ error: "Could not load events." });
  }
});

/** Public: single event by slug. */
router.get("/:slug", async (req, res) => {
  try {
    const item = await Event.findOne({
      slug: String(req.params.slug).toLowerCase(),
      published: true,
    }).lean();
    if (!item) return res.status(404).json({ error: "Event not found." });
    return res.json({ item });
  } catch (err) {
    console.error("[events GET/:slug]", err);
    return res.status(500).json({ error: "Could not load event." });
  }
});

export default router;
