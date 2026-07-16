import { Router } from "express";
import { Event } from "../../models/Event.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = Router();

router.use(requireAdmin);

function sanitizePayload(body = {}) {
  return {
    slug: String(body.slug || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-"),
    title: String(body.title || "").trim(),
    dateISO: String(body.dateISO || "").trim(),
    dateLabel: String(body.dateLabel || "").trim(),
    time: String(body.time || "").trim(),
    venue: String(body.venue || "").trim(),
    space: String(body.space || "").trim(),
    area: String(body.area || "").trim(),
    address: String(body.address || "").trim(),
    mapsUrl: String(body.mapsUrl || "").trim(),
    mapsEmbedUrl: String(body.mapsEmbedUrl || "").trim(),
    city: String(body.city || "Hyderabad").trim(),
    seats: Number(body.seats) || 40,
    format: ["Offline", "Online", "Hybrid"].includes(body.format)
      ? body.format
      : "Offline",
    status: body.status === "coming-soon" ? "coming-soon" : "open",
    blurb: String(body.blurb || "").trim(),
    hosts: Array.isArray(body.hosts) ? body.hosts : [],
    speakers: Array.isArray(body.speakers) ? body.speakers : [],
    guestFounder: body.guestFounder || {},
    published: body.published !== false,
    sortOrder: Number.isFinite(Number(body.sortOrder))
      ? Number(body.sortOrder)
      : 0,
  };
}

function validateEvent(payload) {
  const required = [
    "slug",
    "title",
    "dateISO",
    "dateLabel",
    "time",
    "venue",
    "city",
  ];
  for (const key of required) {
    if (!payload[key]) return `${key} is required.`;
  }
  return null;
}

router.get("/", async (_req, res) => {
  try {
    const items = await Event.find().sort({ sortOrder: 1, dateISO: 1 }).lean();
    return res.json({ items, total: items.length });
  } catch (err) {
    console.error("[admin/events]", err);
    return res.status(500).json({ error: "Could not load events." });
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = sanitizePayload(req.body);
    const error = validateEvent(payload);
    if (error) return res.status(400).json({ error });

    const existing = await Event.findOne({ slug: payload.slug });
    if (existing) {
      return res.status(409).json({ error: "An event with this slug already exists." });
    }

    const item = await Event.create(payload);
    return res.status(201).json({ item });
  } catch (err) {
    console.error("[admin/events POST]", err);
    return res.status(500).json({ error: "Could not create event." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const payload = sanitizePayload(req.body);
    const error = validateEvent(payload);
    if (error) return res.status(400).json({ error });

    const clash = await Event.findOne({
      slug: payload.slug,
      _id: { $ne: req.params.id },
    });
    if (clash) {
      return res.status(409).json({ error: "Another event already uses this slug." });
    }

    const item = await Event.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    }).lean();

    if (!item) return res.status(404).json({ error: "Event not found." });
    return res.json({ item });
  } catch (err) {
    console.error("[admin/events PUT]", err);
    return res.status(500).json({ error: "Could not update event." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await Event.findByIdAndDelete(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Event not found." });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/events DELETE]", err);
    return res.status(500).json({ error: "Could not delete event." });
  }
});

export default router;
