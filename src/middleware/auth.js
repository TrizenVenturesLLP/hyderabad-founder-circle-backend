import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-admin-secret-change-me";

const STAFF_ROLES = new Set(["platform_admin", "org_admin", "admin"]);

export function signAdminToken(admin) {
  return jwt.sign(
    {
      sub: String(admin._id),
      email: admin.email,
      role: admin.role || "platform_admin",
      organizationId: admin.organizationId
        ? String(admin.organizationId)
        : null,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function isPlatformAdmin(req) {
  return req.admin?.role === "platform_admin" || req.admin?.role === "admin";
}

export function isOrgAdmin(req) {
  return req.admin?.role === "org_admin";
}

/** Mongo filter for events owned by the current staff user. */
export function eventOrgFilter(req, extra = {}) {
  if (isPlatformAdmin(req)) {
    const orgId = String(req.query?.organizationId || "").trim();
    if (orgId) return { ...extra, organizationId: orgId };
    return { ...extra };
  }
  if (req.admin?.organizationId) {
    return { ...extra, organizationId: req.admin.organizationId };
  }
  return { ...extra, organizationId: null };
}

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!STAFF_ROLES.has(payload.role)) {
      return res.status(403).json({ error: "Forbidden." });
    }
    req.admin = {
      id: payload.sub,
      email: payload.email,
      role: payload.role === "admin" ? "platform_admin" : payload.role,
      organizationId: payload.organizationId || null,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
