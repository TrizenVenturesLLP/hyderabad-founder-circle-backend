import { Router } from "express";
import { Rsvp } from "../../models/Rsvp.js";
import { EmailLog } from "../../models/EmailLog.js";
import { Event } from "../../models/Event.js";
import {
  eventOrgFilter,
  isPlatformAdmin,
  requireAdmin,
} from "../../middleware/auth.js";
import {
  sendInvoiceEmailNotification,
  sendRsvpConfirmationEmail,
} from "../../services/emailNotification.js";

const router = Router();

router.use(requireAdmin);

async function scopedEventSlugs(req) {
  if (isPlatformAdmin(req) && !String(req.query?.organizationId || "").trim()) {
    return null;
  }
  const events = await Event.find(eventOrgFilter(req)).select("slug").lean();
  return events.map((e) => e.slug);
}

router.get("/", async (req, res) => {
  try {
    const eventSlug = String(req.query.eventSlug || "").trim();
    const q = String(req.query.q || "").trim();
    const filter = {};

    const allowedSlugs = await scopedEventSlugs(req);
    if (allowedSlugs) {
      if (eventSlug && eventSlug !== "all") {
        if (!allowedSlugs.includes(eventSlug)) {
          return res.json({ items: [], events: [], total: 0 });
        }
        filter["event.slug"] = eventSlug;
      } else {
        filter["event.slug"] = { $in: allowedSlugs };
      }
    } else if (eventSlug && eventSlug !== "all") {
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

    const eventQuery = eventOrgFilter(req);

    const [items, allEvents, rsvpCounts, emailStats] = await Promise.all([
      Rsvp.find(filter).sort({ createdAt: -1 }).lean(),
      Event.find(eventQuery)
        .sort({ sortOrder: 1, dateISO: 1 })
        .select("slug title organizationId")
        .lean(),
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

    if (!isPlatformAdmin(req)) {
      const event = await Event.findOne({ slug: item.event?.slug })
        .select("organizationId")
        .lean();
      if (
        !event ||
        String(event.organizationId) !== String(req.admin.organizationId)
      ) {
        return res.status(403).json({ error: "Forbidden." });
      }
    }

    return res.json({ item });
  } catch (err) {
    console.error("[admin/rsvps/:id]", err);
    return res.status(500).json({ error: "Could not load registration." });
  }
});

router.patch("/:id/payment-status", async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim();
    if (!["paid", "unpaid", "failed", "pending_review"].includes(status)) {
      return res.status(400).json({ error: "Invalid payment status." });
    }

    const item = await Rsvp.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Registration not found." });

    if (!isPlatformAdmin(req)) {
      const event = await Event.findOne({ slug: item.event?.slug })
        .select("organizationId")
        .lean();
      if (
        !event ||
        String(event.organizationId) !== String(req.admin.organizationId)
      ) {
        return res.status(403).json({ error: "Forbidden." });
      }
    }

    const wasPaid = item.payment?.status === "paid";
    item.payment = item.payment || {};
    item.payment.status = status;
    if (status === "paid") {
      item.payment.paidAt = item.payment.paidAt || new Date();
    }
    await item.save();

    if (status === "paid" && !wasPaid) {
      void sendRsvpConfirmationEmail({ rsvp: item });
      void sendInvoiceEmailNotification({ rsvp: item });
    }

    return res.json({ item: item.toObject() });
  } catch (err) {
    console.error("[admin/rsvps PATCH payment-status]", err);
    return res.status(500).json({ error: "Could not update payment status." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await Rsvp.findById(req.params.id).lean();
    if (!existing) {
      return res.status(404).json({ error: "Registration not found." });
    }

    if (!isPlatformAdmin(req)) {
      const event = await Event.findOne({ slug: existing.event?.slug })
        .select("organizationId")
        .lean();
      if (
        !event ||
        String(event.organizationId) !== String(req.admin.organizationId)
      ) {
        return res.status(403).json({ error: "Forbidden." });
      }
    }

    await Rsvp.findByIdAndDelete(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/rsvps DELETE]", err);
    return res.status(500).json({ error: "Could not delete registration." });
  }
});

export default router;
