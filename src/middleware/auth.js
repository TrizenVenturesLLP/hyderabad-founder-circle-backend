import jwt from "jsonwebtoken";
import { JuryUser } from "../models/JuryUser.js";
import { Hackathon } from "../models/Hackathon.js";
import { HackathonParticipantAccount } from "../models/HackathonParticipantAccount.js";

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

export function signJuryToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      type: "jury",
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function signHackathonParticipantToken(account) {
  return jwt.sign(
    {
      type: "hackathon-participant",
      sub: String(account._id),
      hackathonId: String(account.hackathonId),
      email: account.normalizedEmail,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function signSubmissionViewToken({ hackathonId, teamId, fileId }) {
  return jwt.sign(
    {
      type: "submission-view",
      hackathonId: String(hackathonId),
      teamId: String(teamId),
      fileId: String(fileId),
    },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}

export function verifySubmissionViewToken(token) {
  try {
    const payload = jwt.verify(String(token || ""), JWT_SECRET);
    return payload.type === "submission-view" ? payload : null;
  } catch {
    return null;
  }
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

export async function requireJury(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== "jury" || !payload.sub) {
      return res.status(403).json({ error: "Jury access required." });
    }
    const user = await JuryUser.findById(payload.sub).select("email name status emailVerified");
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Jury account is unavailable." });
    }
    req.juryUser = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

export async function requireHackathonParticipant(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ message: "Participant sign-in is required." });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Participant session is invalid or expired." });
  }
  if (payload.type !== "hackathon-participant" || !payload.sub || !payload.hackathonId) {
    return res.status(403).json({ message: "Participant access is required." });
  }

  try {
    const account = await HackathonParticipantAccount.findById(payload.sub)
      .select("hackathonId normalizedEmail")
      .lean();
    if (
      !account ||
      String(account.hackathonId) !== String(payload.hackathonId) ||
      account.normalizedEmail !== payload.email
    ) {
      return res.status(401).json({ message: "Participant account is unavailable." });
    }

    const team = await Hackathon.findOne({
      hackathonId: account.hackathonId,
      status: "active",
      $or: [{ email: account.normalizedEmail }, { "members.email": account.normalizedEmail }],
    })
      .select("_id")
      .lean();
    if (!team) {
      return res.status(403).json({ message: "You are not an active member of this Hackathon." });
    }

    req.hackathonParticipant = {
      id: String(account._id),
      hackathonId: String(account.hackathonId),
      email: account.normalizedEmail,
    };
    return next();
  } catch (error) {
    console.error("[hackathon participant authorization]", error);
    return res.status(500).json({ message: "Could not verify participant access." });
  }
}
