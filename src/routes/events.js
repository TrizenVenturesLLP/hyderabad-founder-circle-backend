import { Router } from "express";
import { Event } from "../models/Event.js";
import { Organization } from "../models/Organization.js";
import { publicPaymentConfig } from "../lib/eventPayment.js";
import { REGISTRATION_FEE_INR } from "../lib/razorpay.js";

const router = Router();

async function withOrganization(items) {
  const ids = [
    ...new Set(
      items
        .map((e) => (e.organizationId ? String(e.organizationId) : ""))
        .filter(Boolean),
    ),
  ];
  const orgs = ids.length
    ? await Organization.find({ _id: { $in: ids } })
        .select("name slug type")
        .lean()
    : [];
  const byId = Object.fromEntries(orgs.map((o) => [String(o._id), o]));

  return items.map((e) => {
    const org = e.organizationId ? byId[String(e.organizationId)] : null;
    const payment = publicPaymentConfig(e.payment, REGISTRATION_FEE_INR);
    return {
      ...e,
      organization: org
        ? {
            id: String(org._id),
            name: org.name,
            slug: org.slug,
            type: org.type,
          }
        : null,
      payment,
    };
  });
}

/** Public: list published events for the website. */
router.get("/", async (req, res) => {
  try {
    const orgSlug = String(req.query.organizationSlug || "").trim().toLowerCase();
    const filter = { published: true };

    if (orgSlug) {
      const org = await Organization.findOne({ slug: orgSlug }).lean();
      if (!org) return res.json({ items: [] });
      filter.organizationId = org._id;
    }

    const items = await Event.find(filter)
      .sort({ sortOrder: 1, dateISO: 1 })
      .lean();
    return res.json({ items: await withOrganization(items) });
  } catch (err) {
    console.error("[events GET]", err);
    return res.status(500).json({ error: "Could not load events." });
  }
});

/** Public: list organizations that have published events. */
router.get("/meta/organizations", async (_req, res) => {
  try {
    const ids = await Event.distinct("organizationId", { published: true });
    const items = await Organization.find({ _id: { $in: ids } })
      .sort({ name: 1 })
      .select("name slug type")
      .lean();
    return res.json({
      items: items.map((o) => ({
        id: String(o._id),
        name: o.name,
        slug: o.slug,
        type: o.type,
      })),
    });
  } catch (err) {
    console.error("[events/meta/organizations]", err);
    return res.status(500).json({ error: "Could not load organizations." });
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
    const [enriched] = await withOrganization([item]);
    return res.json({ item: enriched });
  } catch (err) {
    console.error("[events GET/:slug]", err);
    return res.status(500).json({ error: "Could not load event." });
  }
});

export default router;
