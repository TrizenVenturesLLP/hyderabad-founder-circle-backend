import { Router } from "express";
import { AnalyticsEvent } from "../models/AnalyticsEvent.js";
import { Event } from "../models/Event.js";
import { requireAdmin, isPlatformAdmin } from "../middleware/auth.js";

const publicRouter = Router();
const adminRouter = Router();

const FUNNEL_NAMES = new Set([
  "rsvp_open",
  "rsvp_details",
  "rsvp_payment",
  "rsvp_submit",
  "rsvp_success",
]);

function trimStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

function daysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

publicRouter.post("/track", async (req, res) => {
  try {
    const type = trimStr(req.body?.type);
    const name = trimStr(req.body?.name).slice(0, 80);
    const path = trimStr(req.body?.path).slice(0, 300);
    const eventSlug = trimStr(req.body?.eventSlug).slice(0, 120).toLowerCase();
    const sessionId = trimStr(req.body?.sessionId).slice(0, 80);

    if (type !== "pageview" && type !== "funnel") {
      return res.status(400).json({ error: "Invalid analytics type." });
    }
    if (!name) {
      return res.status(400).json({ error: "Event name is required." });
    }
    if (type === "funnel" && !FUNNEL_NAMES.has(name)) {
      return res.status(400).json({ error: "Unknown funnel step." });
    }

    await AnalyticsEvent.create({
      type,
      name,
      path,
      eventSlug,
      sessionId,
      meta:
        req.body?.meta && typeof req.body.meta === "object"
          ? req.body.meta
          : null,
    });

    return res.status(204).end();
  } catch (err) {
    console.error("[analytics/track]", err);
    return res.status(500).json({ error: "Could not record event." });
  }
});

adminRouter.use(requireAdmin);

adminRouter.get("/summary", async (req, res) => {
  try {
    const days = Math.min(
      90,
      Math.max(1, Number(req.query?.days) || 7),
    );
    const since = daysAgo(days);
    const eventSlug = trimStr(req.query?.eventSlug).toLowerCase();

    let slugFilter = {};
    if (eventSlug) {
      slugFilter = { eventSlug };
    } else if (!isPlatformAdmin(req) && req.admin?.organizationId) {
      const orgEvents = await Event.find({
        organizationId: req.admin.organizationId,
      })
        .select("slug")
        .lean();
      const slugs = orgEvents.map((e) => e.slug).filter(Boolean);
      slugFilter = {
        $or: [
          { eventSlug: { $in: slugs } },
          // pageviews without slug still shown only for platform; org sees event-scoped
          ...(slugs.length ? [] : [{ _id: null }]),
        ],
      };
    }

    const matchSince = { createdAt: { $gte: since }, ...slugFilter };

    const [pageviews, uniqueSessions, funnelRows, topPaths, topEvents] =
      await Promise.all([
        AnalyticsEvent.countDocuments({
          ...matchSince,
          type: "pageview",
        }),
        AnalyticsEvent.distinct("sessionId", {
          ...matchSince,
          type: "pageview",
          sessionId: { $ne: "" },
        }).then((ids) => ids.length),
        AnalyticsEvent.aggregate([
          {
            $match: {
              ...matchSince,
              type: "funnel",
              name: { $in: [...FUNNEL_NAMES] },
            },
          },
          {
            $group: {
              _id: "$name",
              sessions: { $addToSet: "$sessionId" },
              count: { $sum: 1 },
            },
          },
        ]),
        AnalyticsEvent.aggregate([
          { $match: { ...matchSince, type: "pageview" } },
          { $group: { _id: "$path", views: { $sum: 1 } } },
          { $sort: { views: -1 } },
          { $limit: 10 },
        ]),
        AnalyticsEvent.aggregate([
          {
            $match: {
              ...matchSince,
              type: "pageview",
              eventSlug: { $ne: "" },
            },
          },
          { $group: { _id: "$eventSlug", views: { $sum: 1 } } },
          { $sort: { views: -1 } },
          { $limit: 10 },
        ]),
      ]);

    const funnelOrder = [
      "rsvp_open",
      "rsvp_details",
      "rsvp_payment",
      "rsvp_submit",
      "rsvp_success",
    ];
    const funnelMap = Object.fromEntries(
      funnelRows.map((row) => [
        row._id,
        {
          count: row.count,
          sessions: (row.sessions || []).filter(Boolean).length,
        },
      ]),
    );
    const funnel = funnelOrder.map((name) => ({
      name,
      label: {
        rsvp_open: "Opened registration",
        rsvp_details: "Completed details",
        rsvp_payment: "Reached payment",
        rsvp_submit: "Submitted booking",
        rsvp_success: "Booking success",
      }[name],
      count: funnelMap[name]?.count || 0,
      sessions: funnelMap[name]?.sessions || 0,
    }));

    return res.json({
      days,
      since: since.toISOString(),
      visitors: {
        pageviews,
        uniqueSessions,
      },
      funnel,
      topPaths: topPaths.map((r) => ({ path: r._id || "/", views: r.views })),
      topEvents: topEvents.map((r) => ({
        slug: r._id,
        views: r.views,
      })),
    });
  } catch (err) {
    console.error("[admin/analytics/summary]", err);
    return res.status(500).json({ error: "Could not load analytics." });
  }
});

export { publicRouter as analyticsPublicRouter, adminRouter as analyticsAdminRouter };
