import { Router } from "express";
import { Event } from "../../models/Event.js";
import { Organization } from "../../models/Organization.js";
import {
  eventOrgFilter,
  isPlatformAdmin,
  requireAdmin,
} from "../../middleware/auth.js";
import { sanitizePaymentConfig } from "../../lib/eventPayment.js";

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
    dateConfirmed: body.dateConfirmed === true,
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
    status: ["open", "coming-soon", "completed"].includes(body.status)
      ? body.status
      : "open",
    blurb: String(body.blurb || "").trim(),
    hosts: Array.isArray(body.hosts) ? body.hosts : [],
    speakers: Array.isArray(body.speakers) ? body.speakers : [],
    guestFounder: body.guestFounder || {},
    published: body.published !== false,
    sortOrder: Number.isFinite(Number(body.sortOrder))
      ? Number(body.sortOrder)
      : 0,
    payment: sanitizePaymentConfig(body.payment),
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

async function attachOrganizations(items) {
  const ids = [
    ...new Set(
      items
        .map((e) => (e.organizationId ? String(e.organizationId) : ""))
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) {
    return items.map((e) => ({ ...e, organization: null }));
  }
  const orgs = await Organization.find({ _id: { $in: ids } })
    .select("name slug type")
    .lean();
  const byId = Object.fromEntries(orgs.map((o) => [String(o._id), o]));
  return items.map((e) => {
    const org = e.organizationId ? byId[String(e.organizationId)] : null;
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
    };
  });
}

async function assertCanAccessEvent(req, event) {
  if (!event) return false;
  if (isPlatformAdmin(req)) return true;
  return (
    event.organizationId &&
    String(event.organizationId) === String(req.admin.organizationId)
  );
}

router.get("/organizations", async (_req, res) => {
  try {
    const items = await Organization.find()
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
    console.error("[admin/events/organizations]", err);
    return res.status(500).json({ error: "Could not load organizations." });
  }
});

router.get("/", async (req, res) => {
  try {
    const filter = eventOrgFilter(req);
    const items = await Event.find(filter)
      .sort({ sortOrder: 1, dateISO: 1 })
      .lean();
    const enriched = await attachOrganizations(items);
    return res.json({ items: enriched, total: enriched.length });
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
      return res
        .status(409)
        .json({ error: "An event with this slug already exists." });
    }

    let organizationId = req.admin.organizationId;
    if (isPlatformAdmin(req)) {
      const requested = String(req.body?.organizationId || "").trim();
      if (requested) {
        const org = await Organization.findById(requested).lean();
        if (!org) {
          return res.status(400).json({ error: "Invalid organization." });
        }
        organizationId = org._id;
      } else {
        const adminOrg = await Organization.findOne({ slug: "admin" }).lean();
        organizationId = adminOrg?._id || null;
      }
    }

    if (!organizationId) {
      return res
        .status(400)
        .json({ error: "Organization is required to create an event." });
    }

    const item = await Event.create({
      ...payload,
      organizationId,
      createdBy: req.admin.id,
    });
    const [enriched] = await attachOrganizations([item.toObject()]);
    return res.status(201).json({ item: enriched });
  } catch (err) {
    console.error("[admin/events POST]", err);
    return res.status(500).json({ error: "Could not create event." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const existing = await Event.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: "Event not found." });
    if (!(await assertCanAccessEvent(req, existing))) {
      return res.status(403).json({ error: "Forbidden." });
    }

    const payload = sanitizePayload(req.body);
    const error = validateEvent(payload);
    if (error) return res.status(400).json({ error });

    const clash = await Event.findOne({
      slug: payload.slug,
      _id: { $ne: req.params.id },
    });
    if (clash) {
      return res
        .status(409)
        .json({ error: "Another event already uses this slug." });
    }

    const update = { ...payload };
    if (isPlatformAdmin(req)) {
      const requested = String(req.body?.organizationId || "").trim();
      if (requested) {
        const org = await Organization.findById(requested).lean();
        if (!org) {
          return res.status(400).json({ error: "Invalid organization." });
        }
        update.organizationId = org._id;
      }
    }

    const item = await Event.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!item) return res.status(404).json({ error: "Event not found." });
    const [enriched] = await attachOrganizations([item]);
    return res.json({ item: enriched });
  } catch (err) {
    console.error("[admin/events PUT]", err);
    return res.status(500).json({ error: "Could not update event." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await Event.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: "Event not found." });
    if (!(await assertCanAccessEvent(req, existing))) {
      return res.status(403).json({ error: "Forbidden." });
    }

    await Event.findByIdAndDelete(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/events DELETE]", err);
    return res.status(500).json({ error: "Could not delete event." });
  }
});

export default router;
