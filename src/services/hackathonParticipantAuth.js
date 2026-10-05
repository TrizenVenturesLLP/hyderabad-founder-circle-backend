import crypto from "node:crypto";
import { HackathonParticipantAccount } from "../models/HackathonParticipantAccount.js";

const WEB_APP_URL = process.env.WEB_APP_URL || "https://ty.trizenventures.com";
export const PASSWORD_SETUP_TTL_MS = 10 * 60 * 1000;

export function hashSetupToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function hackathonLoginUrl(email = "") {
  const base = `${WEB_APP_URL.replace(/\/$/, "")}/hackathon/login`;
  return email ? `${base}?email=${encodeURIComponent(email)}` : base;
}

/**
 * Issues a fresh single-use set-password link for a participant.
 * When the participant already has a password and `force` is false,
 * no token is issued and the sign-in URL is returned instead.
 */
export async function issuePasswordSetupLink({ hackathonId, email, force = false }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const account = await HackathonParticipantAccount.findOneAndUpdate(
    { hackathonId, normalizedEmail },
    { $setOnInsert: { hackathonId, normalizedEmail } },
    { new: true, upsert: true },
  );

  if (account.passwordHash && !force) {
    return { hasPassword: true, url: hackathonLoginUrl(normalizedEmail), expiresAt: null };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSWORD_SETUP_TTL_MS);
  account.setupTokenHash = hashSetupToken(rawToken);
  account.setupTokenExpiresAt = expiresAt;
  account.lastLinkSentAt = new Date();
  await account.save();

  return {
    hasPassword: Boolean(account.passwordHash),
    url: `${WEB_APP_URL.replace(/\/$/, "")}/hackathon/set-password#token=${encodeURIComponent(rawToken)}`,
    expiresAt,
  };
}

export async function findAccountBySetupToken(token) {
  const value = String(token || "");
  if (value.length < 32 || value.length > 200) return null;
  return HackathonParticipantAccount.findOne({
    setupTokenHash: hashSetupToken(value),
    setupTokenExpiresAt: { $gt: new Date() },
  });
}
