import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-admin-secret-change-me";

export function signAdminToken(admin) {
  return jwt.sign(
    { sub: String(admin._id), email: admin.email, role: "admin" },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ error: "Forbidden." });
    }
    req.admin = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
