import { Router } from "express";
import bcrypt from "bcryptjs";
import { Admin } from "../../models/Admin.js";
import { Organization } from "../../models/Organization.js";
import { requireAdmin, signAdminToken } from "../../middleware/auth.js";

const router = Router();

async function serializeAdmin(admin) {
  let organization = null;
  if (admin.organizationId) {
    const org = await Organization.findById(admin.organizationId)
      .select("name slug type status")
      .lean();
    if (org) {
      organization = {
        id: String(org._id),
        name: org.name,
        slug: org.slug,
        type: org.type,
        status: org.status || "active",
      };
    }
  }

  return {
    id: admin._id,
    email: admin.email,
    name: admin.name,
    role: admin.role || "platform_admin",
    organizationId: admin.organizationId
      ? String(admin.organizationId)
      : null,
    organization,
  };
}

async function loginWithRoleGate(req, res, allowedRoles) {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  if (!admin.role) {
    admin.role = "platform_admin";
    await admin.save();
  }

  if (!allowedRoles.includes(admin.role)) {
    return res.status(403).json({
      error:
        admin.role === "org_admin"
          ? "This is an organization account. Please sign in at /org-login."
          : "This is a platform admin account. Please sign in at /admin-login.",
    });
  }

  if (admin.role === "org_admin") {
    const org = await Organization.findById(admin.organizationId)
      .select("status name")
      .lean();
    if (!org || org.status !== "active") {
      return res.status(403).json({
        error:
          "Your organization is not active yet. Wait for admin approval before signing in.",
      });
    }
  }

  const token = signAdminToken(admin);
  return res.json({
    token,
    admin: await serializeAdmin(admin),
  });
}

router.post("/login", async (req, res) => {
  try {
    return await loginWithRoleGate(req, res, ["platform_admin"]);
  } catch (err) {
    console.error("[admin/login]", err);
    return res.status(500).json({ error: "Login failed." });
  }
});

router.post("/org-login", async (req, res) => {
  try {
    return await loginWithRoleGate(req, res, ["org_admin"]);
  } catch (err) {
    console.error("[admin/org-login]", err);
    return res.status(500).json({ error: "Login failed." });
  }
});

router.get("/me", requireAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select(
      "email name role organizationId",
    );
    if (!admin) {
      return res.status(401).json({ error: "Admin not found." });
    }
    return res.json({
      admin: await serializeAdmin(admin),
    });
  } catch (err) {
    console.error("[admin/me]", err);
    return res.status(500).json({ error: "Could not load admin." });
  }
});

export default router;
