import { Router } from "express";
import { Rsvp } from "../../models/Rsvp.js";
import { EmailLog } from "../../models/EmailLog.js";
import { Event } from "../../models/Event.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = Router();

router.use(requireAdmin);

router.get("/", async (req, res) => {
  try {
    const eventSlug = String(req.query.eventSlug || "").trim();
    const q = String(req.query.q || "").trim();
    const filter = {};

    if (eventSlug && eventSlug !== "all") {
      filter["event.slug"] = eventSlug;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { company: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
      ];
    }

    const [items, allEvents, rsvpCounts, emailStats] = await Promise.all([
      Rsvp.find(filter).sort({ createdAt: -1 }).lean(),
      Event.find().sort({ sortOrder: 1, dateISO: 1 }).select("slug title").lean(),
      Rsvp.aggregate([
        {
          $group: {
            _id: "$event.slug",
            count: { $sum: 1 },
          },
        },
      ]),
      EmailLog.aggregate([
        { $unwind: "$recipients" },
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: { $toLower: "$recipients.email" },
            sentCount: {
              $sum: {
                $cond: [{ $eq: ["$recipients.status", "sent"] }, 1, 0],
              },
            },
            failedCount: {
              $sum: {
                $cond: [{ $eq: ["$recipients.status", "failed"] }, 1, 0],
              },
            },
            lastStatus: { $last: "$recipients.status" },
            lastSentAt: { $last: "$createdAt" },
          },
        },
      ]),
    ]);

    const countBySlug = Object.fromEntries(
      rsvpCounts.map((e) => [e._id, e.count || 0]),
    );

    const statsByEmail = Object.fromEntries(
      emailStats.map((s) => [
        s._id,
        {
          sentCount: s.sentCount || 0,
          failedCount: s.failedCount || 0,
          lastStatus: s.lastStatus || "",
          lastSentAt: s.lastSentAt || null,
        },
      ]),
    );

    const enriched = items.map((item) => {
      const key = String(item.email || "").toLowerCase();
      const stats = statsByEmail[key] || {
        sentCount: 0,
        failedCount: 0,
        lastStatus: "",
        lastSentAt: null,
      };
      return {
        ...item,
        emailStats: stats,
      };
    });

    return res.json({
      items: enriched,
      events: allEvents.map((e) => ({
        slug: e.slug,
        title: e.title,
        count: countBySlug[e.slug] || 0,
      })),
      total: enriched.length,
    });
  } catch (err) {
    console.error("[admin/rsvps]", err);
    return res.status(500).json({ error: "Could not load registrations." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await Rsvp.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Registration not found." });
    return res.json({ item });
  } catch (err) {
    console.error("[admin/rsvps/:id]", err);
    return res.status(500).json({ error: "Could not load registration." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await Rsvp.findByIdAndDelete(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Registration not found." });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/rsvps DELETE]", err);
    return res.status(500).json({ error: "Could not delete registration." });
  }
});

export default router;
