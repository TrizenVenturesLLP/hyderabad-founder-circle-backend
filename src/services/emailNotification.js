import { sendDirectMail } from "../lib/mailer.js";
import {
  buildRsvpConfirmationEmail,
  buildInvoiceEmail,
} from "../lib/emailTemplates.js";
import { generateInvoicePdf } from "../lib/invoicePdf.js";

const EMAIL_SERVICE_URL =
  process.env.EMAIL_SERVICE_URL || "http://127.0.0.1:4007";
const EMAIL_SERVICE_AUTH_TOKEN = process.env.EMAIL_SERVICE_AUTH_TOKEN || "";
const WEB_APP_URL = process.env.WEB_APP_URL || "https://ty.trizenventures.com";
const COMMUNITY_WHATSAPP_URL =
  process.env.COMMUNITY_WHATSAPP_URL ||
  "https://chat.whatsapp.com/HaoiMStGYdg5J5dF5lh9NQ?mode=gi_t";
const DEFAULT_MAPS_URL =
  process.env.DEFAULT_MAPS_URL ||
  "https://maps.app.goo.gl/KTRvgep4y9ciSCjSA?g_st=com.microsoft.skype.teams.extshare";

function formatFetchError(err) {
  if (!(err instanceof Error)) return String(err);
  const cause =
    err.cause instanceof Error
      ? `${err.cause.message}${err.cause.code ? ` (${err.cause.code})` : ""}`
      : err.cause
        ? String(err.cause)
        : "";
  return cause ? `${err.message}: ${cause}` : err.message;
}

function paymentPayload(payment) {
  if (!payment) return null;
  const plain =
    typeof payment.toObject === "function" ? payment.toObject() : payment;
  if (!plain || typeof plain !== "object") return null;
  return {
    status: plain.status || "",
    amountInr: plain.amountInr || 0,
    currency: plain.currency || "INR",
    method: plain.method || "",
    razorpayOrderId: plain.razorpayOrderId || "",
    razorpayPaymentId: plain.razorpayPaymentId || "",
    paidAt: plain.paidAt ? new Date(plain.paidAt).toISOString() : "",
  };
}

/**
 * Generate invoice number: TZV/YY-YY/XXXXX
 * Uses last 5 alphanumeric chars of the Razorpay payment ID.
 */
function generateInvoiceNumber(paymentId) {
  const now = new Date();
  const istYear = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  ).getFullYear();
  const monthIST = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  ).getMonth();
  const fyStart = monthIST >= 3 ? istYear : istYear - 1;
  const fyEnd = fyStart + 1;
  const fyLabel = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
  const suffix = String(paymentId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-5)
    .toUpperCase()
    .padStart(5, "0");
  return `TZV/${fyLabel}/${suffix}`;
}

// ── Microservice helpers ──────────────────────────────────────────────────────

async function postToEmailService(path, body, timeoutMs = 35000) {
  if (!EMAIL_SERVICE_AUTH_TOKEN) return null; // skip, will fall back to direct SMTP

  const url = `${EMAIL_SERVICE_URL.replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": EMAIL_SERVICE_AUTH_TOKEN,
        "X-Service-Name": "hfn-rsvp-backend",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[email] Service ${path} failed:`, data.error || res.statusText);
      return false; // reachable but returned error — still try fallback
    }
    return true; // success
  } catch (err) {
    // ECONNREFUSED / timeout — service is down
    console.warn(`[email] Service unreachable (${path}):`, formatFetchError(err));
    return null; // null = fall back to direct SMTP
  } finally {
    clearTimeout(timer);
  }
}

// ── Confirmation email ────────────────────────────────────────────────────────

/**
 * Fire-and-forget RSVP confirmation email.
 * Tries email microservice first; falls back to direct SMTP.
 */
export async function sendRsvpConfirmationEmail({ rsvp, mapsUrl }) {
  const eventSlug = rsvp.event?.slug || "";
  const base = WEB_APP_URL.replace(/\/$/, "");
  const eventUrl = eventSlug ? `${base}/events/${eventSlug}` : base;
  const badgeUrl = eventSlug
    ? `${base}/badge?event=${encodeURIComponent(eventSlug)}${
        rsvp.name ? `&name=${encodeURIComponent(String(rsvp.name).trim())}` : ""
      }`
    : `${base}/badge`;

  let space = "";
  let address = "";
  let resolvedMapsUrl = typeof mapsUrl === "string" ? mapsUrl.trim() : "";

  if (eventSlug) {
    try {
      const { Event } = await import("../models/Event.js");
      const eventDoc = await Event.findOne({ slug: eventSlug }).lean();
      if (eventDoc) {
        space = eventDoc.space || "";
        address = eventDoc.address || "";
        if (!resolvedMapsUrl) resolvedMapsUrl = eventDoc.mapsUrl || "";
      }
    } catch (err) {
      console.warn("[email] Could not enrich event details:", err instanceof Error ? err.message : err);
    }
  }
  if (!resolvedMapsUrl) resolvedMapsUrl = DEFAULT_MAPS_URL;

  const serviceBody = {
    email: rsvp.email,
    name: rsvp.name,
    eventSlug,
    eventTitle: rsvp.event?.title,
    dateLabel: rsvp.event?.dateLabel,
    time: rsvp.event?.time,
    venue: rsvp.event?.venue,
    space,
    address,
    city: rsvp.event?.city,
    format: rsvp.event?.format,
    mapsUrl: resolvedMapsUrl,
    eventUrl,
    badgeUrl,
    communityUrl: COMMUNITY_WHATSAPP_URL,
    supportEmail: "community@trizenventures.com",
    payment: paymentPayload(rsvp.payment),
  };

  // Try microservice
  const serviceResult = await postToEmailService("/api/v1/email/rsvp-confirmation", serviceBody);
  if (serviceResult === true) {
    console.log("[email] Confirmation sent via microservice to", rsvp.email);
    return;
  }

  // Fallback: send directly
  console.log("[email] Sending confirmation directly (SMTP fallback) to", rsvp.email);
  try {
    const rendered = buildRsvpConfirmationEmail({
      ...serviceBody,
      payment: null, // registration email has no payment block
    });
    await sendDirectMail({
      to: rsvp.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    console.log("[email] Confirmation sent directly to", rsvp.email);
  } catch (err) {
    console.error("[email] Direct confirmation send failed:", err instanceof Error ? err.message : err);
  }
}

// ── Invoice email ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget Tax Invoice email with PDF attachment.
 * Tries email microservice first; falls back to direct SMTP with locally generated PDF.
 */
export async function sendInvoiceEmailNotification({ rsvp }) {
  const payment = rsvp.payment
    ? typeof rsvp.payment.toObject === "function"
      ? rsvp.payment.toObject()
      : rsvp.payment
    : null;

  const invoiceNumber = generateInvoiceNumber(payment?.razorpayPaymentId);
  const invoiceDate = payment?.paidAt ? new Date(payment.paidAt) : new Date();
  const amountInr = payment?.amountInr || 0;
  const eventSlug = rsvp.event?.slug || "";

  const serviceBody = {
    email: rsvp.email,
    name: rsvp.name,
    amountInr,
    invoiceNumber,
    invoiceDate: invoiceDate.toISOString(),
    eventTitle: rsvp.event?.title || "",
    eventSlug,
    eventDate: rsvp.event?.dateLabel || "",
    eventTime: rsvp.event?.time || "",
    eventVenue: [rsvp.event?.venue, rsvp.event?.city].filter(Boolean).join(", "),
    razorpayPaymentId: payment?.razorpayPaymentId || "",
  };

  // Try microservice
  const serviceResult = await postToEmailService("/api/v1/email/invoice", serviceBody);
  if (serviceResult === true) {
    console.log("[email] Invoice sent via microservice to", rsvp.email);
    return;
  }

  // Fallback: generate PDF + send directly
  console.log("[email] Sending invoice directly (SMTP fallback) to", rsvp.email);
  try {
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber,
      invoiceDate,
      billToName: rsvp.name,
      billToEmail: rsvp.email,
      eventTitle: rsvp.event?.title || "",
      amountInr,
    });

    const safeNum = invoiceNumber.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const rendered = buildInvoiceEmail({
      name: rsvp.name,
      email: rsvp.email,
      amountInr,
      invoiceNumber,
      invoiceDate,
      eventTitle: rsvp.event?.title || "",
      eventDate: rsvp.event?.dateLabel || "",
      eventTime: rsvp.event?.time || "",
      eventVenue: [rsvp.event?.venue, rsvp.event?.city].filter(Boolean).join(", "),
      razorpayPaymentId: payment?.razorpayPaymentId || "",
    });

    await sendDirectMail({
      to: rsvp.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: [
        {
          filename: `Invoice_${safeNum}.pdf`,
          content: pdfBuffer.toString("base64"),
          contentType: "application/pdf",
        },
      ],
    });
    console.log("[email] Invoice sent directly to", rsvp.email);
  } catch (err) {
    console.error("[email] Direct invoice send failed:", err instanceof Error ? err.message : err);
  }
}

// ── Custom emails (admin panel) ───────────────────────────────────────────────

/** Replace {{name}}, {{email}}, etc. in a template string. */
export function applyEmailTemplate(template, vars = {}) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export async function sendCustomEmails({ subject, body, recipients, attachments = [] }) {
  if (!EMAIL_SERVICE_AUTH_TOKEN) {
    throw new Error("EMAIL_SERVICE_AUTH_TOKEN is not configured. Cannot send emails.");
  }

  const results = [];

  for (const recipient of recipients) {
    const vars = {
      name: recipient.name || "",
      email: recipient.email || "",
      company: recipient.company || "",
      eventTitle: recipient.eventTitle || "",
      eventDate: recipient.eventDate || "",
      eventTime: recipient.eventTime || "",
      venue: recipient.venue || "",
    };

    const personalizedSubject = applyEmailTemplate(subject, vars);
    const personalizedBody = applyEmailTemplate(body, vars);
    const html = personalizedBody.includes("<")
      ? personalizedBody
      : `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(personalizedBody)}</div>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(
        `${EMAIL_SERVICE_URL.replace(/\/$/, "")}/api/v1/email/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Service-Auth": EMAIL_SERVICE_AUTH_TOKEN,
            "X-Service-Name": "hfn-rsvp-backend",
          },
          body: JSON.stringify({
            to: recipient.email,
            name: recipient.name,
            subject: personalizedSubject,
            html,
            text: stripHtml(personalizedBody),
            attachments: attachments.map((a) => ({
              filename: a.filename,
              contentType: a.contentType || "application/octet-stream",
              content: a.content,
            })),
            supportEmail: "community@trizenventures.com",
          }),
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        results.push({ email: recipient.email, name: recipient.name, rsvpId: recipient.rsvpId, status: "failed", error: data.error || res.statusText || "Send failed" });
      } else {
        results.push({ email: recipient.email, name: recipient.name, rsvpId: recipient.rsvpId, status: "sent", error: "" });
      }
    } catch (err) {
      results.push({ email: recipient.email, name: recipient.name, rsvpId: recipient.rsvpId, status: "failed", error: err instanceof Error ? err.message : "Send error" });
    } finally {
      clearTimeout(timeout);
    }
  }

  return results;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(str) {
  return String(str)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}
