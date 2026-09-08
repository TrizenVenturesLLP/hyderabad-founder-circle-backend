import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Admin } from "../../models/Admin.js";
import { Organization } from "../../models/Organization.js";
import { OrgApplication } from "../../models/OrgApplication.js";
import { isPlatformAdmin, requireAdmin } from "../../middleware/auth.js";

const router = Router();

router.use(requireAdmin);

function slugify(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || `org-${Date.now().toString(36)}`;
}

function createTempPassword() {
  return `Org${crypto.randomBytes(3).toString("hex")}!`;
}

router.get("/", async (req, res) => {
  try {
    if (!isPlatformAdmin(req)) {
      return res.status(403).json({ error: "Platform admin only." });
    }
    const status = String(req.query.status || "").trim();
    const filter = {};
    if (["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }
    const items = await OrgApplication.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items, total: items.length });
  } catch (err) {
    console.error("[admin/org-applications]", err);
    return res.status(500).json({ error: "Could not load applications." });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    if (!isPlatformAdmin(req)) {
      return res.status(403).json({ error: "Platform admin only." });
    }

    const app = await OrgApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ error: "Application not found." });
    if (app.status === "approved") {
      return res.status(400).json({ error: "Already approved." });
    }

    const existingUser = await Admin.findOne({ email: app.email }).lean();
    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    let slug = slugify(app.organizationName);
    const clash = await Organization.findOne({ slug }).lean();
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const org = await Organization.create({
      name: app.organizationName,
      slug,
      type: "partner",
      status: "active",
    });

    const tempPassword = createTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await Admin.create({
      email: app.email,
      passwordHash,
      name: app.contactName || app.organizationName,
      role: "org_admin",
      organizationId: org._id,
    });

    app.status = "approved";
    app.reviewedAt = new Date();
    app.reviewedBy = req.admin.id;
    app.organizationId = org._id;
    app.rejectionReason = "";
    await app.save();

    return res.json({
      ok: true,
      item: app.toObject(),
      organization: {
        id: String(org._id),
        name: org.name,
        slug: org.slug,
      },
      credentials: {
        email: app.email,
        temporaryPassword: tempPassword,
        loginPath: "/org-login",
      },
    });
  } catch (err) {
    console.error("[admin/org-applications approve]", err);
    return res.status(500).json({ error: "Could not approve application." });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    if (!isPlatformAdmin(req)) {
      return res.status(403).json({ error: "Platform admin only." });
    }

    const app = await OrgApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ error: "Application not found." });
    if (app.status === "approved") {
      return res.status(400).json({ error: "Cannot reject an approved application." });
    }

    app.status = "rejected";
    app.reviewedAt = new Date();
    app.reviewedBy = req.admin.id;
    app.rejectionReason = String(req.body?.reason || "").trim().slice(0, 400);
    await app.save();

    return res.json({ ok: true, item: app.toObject() });
  } catch (err) {
    console.error("[admin/org-applications reject]", err);
    return res.status(500).json({ error: "Could not reject application." });
  }
});

export default router;
