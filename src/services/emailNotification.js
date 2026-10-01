import { sendDirectMail } from "../lib/mailer.js";
import {
  buildRsvpConfirmationEmail,
  buildPaymentReviewEmail,
  buildInvoiceEmail,
  buildAdminCustomEmail,
  buildHackathonTeamInvitationEmail,
  buildHackathonJuryInvitationEmail,
  buildHackathonRegistrationConfirmationEmail,
  buildHackathonPasswordSetupEmail,
} from "../lib/emailTemplates.js";
import { issuePasswordSetupLink } from "./hackathonParticipantAuth.js";
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

function publicEventDateLabel(eventDoc, fallback = "") {
  if (eventDoc?.status === "completed" || eventDoc?.dateConfirmed === true) {
    return eventDoc?.dateLabel || fallback;
  }
  return "Date to be confirmed";
}

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

/** Primary registrant plus any additional ticket members (unique emails). */
function registrationRecipients(rsvp) {
  const recipients = [
    {
      email: String(rsvp?.email || "")
        .trim()
        .toLowerCase(),
      name: String(rsvp?.name || "").trim(),
    },
  ];
  const guests = Array.isArray(rsvp?.guests) ? rsvp.guests : [];
  for (const guest of guests) {
    recipients.push({
      email: String(guest?.email || "")
        .trim()
        .toLowerCase(),
      name: String(guest?.name || "").trim(),
    });
  }
  const seen = new Set();
  return recipients.filter((r) => {
    if (!r.email || seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });
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

  let space = "";
  let address = "";
  let resolvedMapsUrl = typeof mapsUrl === "string" ? mapsUrl.trim() : "";
  let dateLabel = rsvp.event?.dateLabel;

  if (eventSlug) {
    try {
      const { Event } = await import("../models/Event.js");
      const eventDoc = await Event.findOne({ slug: eventSlug }).lean();
      if (eventDoc) {
        space = eventDoc.space || "";
        address = eventDoc.address || "";
        if (!resolvedMapsUrl) resolvedMapsUrl = eventDoc.mapsUrl || "";
        dateLabel = publicEventDateLabel(eventDoc, dateLabel);
      }
    } catch (err) {
      console.warn("[email] Could not enrich event details:", err instanceof Error ? err.message : err);
    }
  }
  if (!resolvedMapsUrl) resolvedMapsUrl = DEFAULT_MAPS_URL;

  const serviceBodyBase = {
    eventSlug,
    eventTitle: rsvp.event?.title,
    dateLabel,
    time: rsvp.event?.time,
    venue: rsvp.event?.venue,
    space,
    address,
    city: rsvp.event?.city,
    format: rsvp.event?.format,
    mapsUrl: resolvedMapsUrl,
    eventUrl,
    communityUrl: COMMUNITY_WHATSAPP_URL,
    supportEmail: "community@trizenventures.com",
    senderName: rsvp.event?.title || "Trizen Community",
    payment: paymentPayload(rsvp.payment),
  };

  for (const recipient of registrationRecipients(rsvp)) {
    const serviceBody = {
      ...serviceBodyBase,
      email: recipient.email,
      name: recipient.name || recipient.email,
      badgeUrl: eventSlug
        ? `${base}/badge?event=${encodeURIComponent(eventSlug)}${
            recipient.name
              ? `&name=${encodeURIComponent(String(recipient.name).trim())}`
              : ""
          }`
        : `${base}/badge`,
    };

    const serviceResult = await postToEmailService(
      "/api/v1/email/rsvp-confirmation",
      serviceBody,
    );
    if (serviceResult === true) {
      console.log("[email] Confirmation sent via microservice to", recipient.email);
      continue;
    }

    console.log(
      "[email] Sending confirmation directly (SMTP fallback) to",
      recipient.email,
    );
    try {
      const rendered = buildRsvpConfirmationEmail({
        ...serviceBody,
        payment: null, // registration email has no payment block
      });
      await sendDirectMail({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        senderName: serviceBody.senderName,
      });
      console.log("[email] Confirmation sent directly to", recipient.email);
    } catch (err) {
      console.error(
        "[email] Direct confirmation send failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function sendPaymentReviewEmail({ rsvp }) {
  const serviceBodyBase = {
    eventSlug: rsvp.event?.slug || "",
    eventTitle: rsvp.event?.title || "Event registration",
    senderName: rsvp.event?.title || "Trizen Community",
  };

  for (const recipient of registrationRecipients(rsvp)) {
    const serviceBody = {
      ...serviceBodyBase,
      email: recipient.email,
      name: recipient.name || recipient.email,
    };

    const serviceResult = await postToEmailService(
      "/api/v1/email/payment-review",
      serviceBody,
    );
    if (serviceResult === true) {
      console.log(
        "[email] Payment review email sent via microservice to",
        recipient.email,
      );
      continue;
    }

    const rendered = buildPaymentReviewEmail(serviceBody);
    try {
      await sendDirectMail({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        senderName: serviceBody.senderName,
      });
      console.log(
        "[email] Payment review email sent directly to",
        recipient.email,
      );
    } catch (err) {
      console.error(
        "[email] Direct payment review send failed:",
        err instanceof Error ? err.message : err,
      );
    }
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
  let eventDate = rsvp.event?.dateLabel || "";

  if (eventSlug) {
    try {
      const { Event } = await import("../models/Event.js");
      const eventDoc = await Event.findOne({ slug: eventSlug }).lean();
      if (eventDoc) eventDate = publicEventDateLabel(eventDoc, eventDate);
    } catch (err) {
      console.warn("[email] Could not resolve invoice event date:", err instanceof Error ? err.message : err);
    }
  }

  const serviceBodyBase = {
    amountInr,
    invoiceNumber,
    invoiceDate: invoiceDate.toISOString(),
    eventTitle: rsvp.event?.title || "",
    eventSlug,
    eventDate,
    eventTime: rsvp.event?.time || "",
    eventVenue: [rsvp.event?.venue, rsvp.event?.city].filter(Boolean).join(", "),
    razorpayPaymentId: payment?.razorpayPaymentId || "",
    senderName: rsvp.event?.title || "Trizen Community",
  };

  let pdfBuffer = null;
  for (const recipient of registrationRecipients(rsvp)) {
    const serviceBody = {
      ...serviceBodyBase,
      email: recipient.email,
      name: recipient.name || recipient.email,
    };

    const serviceResult = await postToEmailService(
      "/api/v1/email/invoice",
      serviceBody,
    );
    if (serviceResult === true) {
      console.log("[email] Invoice sent via microservice to", recipient.email);
      continue;
    }

    console.log(
      "[email] Sending invoice directly (SMTP fallback) to",
      recipient.email,
    );
    try {
      if (!pdfBuffer) {
        pdfBuffer = await generateInvoicePdf({
          invoiceNumber,
          invoiceDate,
          billToName: rsvp.name,
          billToEmail: rsvp.email,
          eventTitle: rsvp.event?.title || "",
          amountInr,
        });
      }

      const safeNum = invoiceNumber.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const rendered = buildInvoiceEmail({
        name: recipient.name || recipient.email,
        email: recipient.email,
        amountInr,
        invoiceNumber,
        invoiceDate,
        eventTitle: rsvp.event?.title || "",
        eventDate,
        eventTime: rsvp.event?.time || "",
        eventVenue: [rsvp.event?.venue, rsvp.event?.city]
          .filter(Boolean)
          .join(", "),
        razorpayPaymentId: payment?.razorpayPaymentId || "",
      });

      await sendDirectMail({
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        senderName: serviceBody.senderName,
        attachments: [
          {
            filename: `Invoice_${safeNum}.pdf`,
            content: pdfBuffer.toString("base64"),
            contentType: "application/pdf",
          },
        ],
      });
      console.log("[email] Invoice sent directly to", recipient.email);
    } catch (err) {
      console.error(
        "[email] Direct invoice send failed:",
        err instanceof Error ? err.message : err,
      );
    }
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
      address: recipient.address || "",
      mapsUrl: recipient.mapsUrl || "",
      eventUrl: recipient.eventUrl || "",
      whatsappUrl: recipient.whatsappUrl || COMMUNITY_WHATSAPP_URL,
      communityUrl: recipient.whatsappUrl || COMMUNITY_WHATSAPP_URL,
      supportEmail: recipient.supportEmail || "community@trizenventures.com",
      supportPhone: recipient.supportPhone || "+91 86396 48822",
    };

    const personalizedSubject = applyEmailTemplate(subject, vars);
    const personalizedBody = applyEmailTemplate(body, vars);
    // Always convert structured plain text into proper HTML paragraphs/bold/links
    // so Gmail/Outlook keep the layout the admin typed.
    const rendered = buildAdminCustomEmail({
      subject: personalizedSubject,
      body: personalizedBody,
    });

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
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
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

export async function sendHackathonTeamInvitations({ team, members = [] }) {
  const teamLeadEmail = String(team?.email || "").trim().toLowerCase();
  const seenEmails = new Set([teamLeadEmail]);
  const invitees = members.filter((member) => {
    const email = String(member?.email || "").trim().toLowerCase();
    if (!email || seenEmails.has(email)) return false;
    seenEmails.add(email);
    return true;
  });

  const results = await Promise.all(
    invitees.map(async (member) => {
      const email = String(member.email).trim().toLowerCase();
      const name = String(member.full_name || "").trim();

      try {
        const rendered = buildHackathonTeamInvitationEmail({
          name,
          teamName: team.team_name,
          teamLead: team.lead_name,
          teamLeadEmail: team.email,
          memberEmail: email,
          hackathonUrl: `${WEB_APP_URL.replace(/\/$/, "")}/hackathon`,
        });
        return await deliverHackathonEmail(
          { to: email, name, ...rendered },
          "hackathon-invitation",
        );
      } catch (error) {
        console.error(
          "[hackathon-invitation] Email delivery failed:",
          error instanceof Error ? error.message : error,
        );
        return false;
      }
    }),
  );

  return {
    attempted: results.length,
    sent: results.filter(Boolean).length,
    failed: results.filter((sent) => !sent).length,
  };
}

async function deliverHackathonEmail({ to, name, subject, html, text }, logTag) {
  const message = {
    to,
    name,
    subject,
    html,
    text,
    supportEmail: "community@trizenventures.com",
  };

  try {
    if (!EMAIL_SERVICE_AUTH_TOKEN) {
      throw new Error("EMAIL_SERVICE_AUTH_TOKEN is not configured in the backend environment.");
    }

    const sentByService = await postToEmailService("/api/v1/email/send", message, 20000);
    if (sentByService === true) return true;
    if (sentByService === false) return false;

    await sendDirectMail({ ...message, senderName: "Hyderabad Founders Network" });
    return true;
  } catch (error) {
    console.error(
      `[${logTag}] Email delivery failed:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function sendHackathonRegistrationConfirmation({ team }) {
  const email = String(team?.email || "").trim().toLowerCase();
  try {
    const access = await issuePasswordSetupLink({ hackathonId: team.hackathonId, email });
    const rendered = buildHackathonRegistrationConfirmationEmail({
      name: team.lead_name,
      teamName: team.team_name,
      leadEmail: email,
      members: team.members || [],
      actionUrl: access.url,
      hasPassword: access.hasPassword,
      expiresAt: access.expiresAt,
    });
    return await deliverHackathonEmail(
      { to: email, name: team.lead_name, ...rendered },
      "hackathon-registration",
    );
  } catch (error) {
    console.error(
      "[hackathon-registration] Email delivery failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function sendHackathonPasswordSetupEmail({ hackathonId, email, name, teamName }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  try {
    const access = await issuePasswordSetupLink({
      hackathonId,
      email: normalizedEmail,
      force: true,
    });
    const rendered = buildHackathonPasswordSetupEmail({
      name,
      teamName,
      email: normalizedEmail,
      setupUrl: access.url,
      expiresAt: access.expiresAt,
    });
    return await deliverHackathonEmail(
      { to: normalizedEmail, name, ...rendered },
      "hackathon-password-setup",
    );
  } catch (error) {
    console.error(
      "[hackathon-password-setup] Email delivery failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function sendHackathonJuryInvitation({ email, name, hackathonName, invitationUrl, expiresAt }) {
  if (!EMAIL_SERVICE_AUTH_TOKEN) {
    return { sent: false, error: "Email service authentication is not configured." };
  }

  const rendered = buildHackathonJuryInvitationEmail({
    name,
    hackathonName,
    invitationUrl,
    expiresAt,
  });
  const message = {
    to: email,
    name,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    supportEmail: "community@trizenventures.com",
  };

  try {
    const serviceResult = await postToEmailService("/api/v1/email/send", message, 20000);
    if (serviceResult === true) return { sent: true };
    if (serviceResult === false) return { sent: false, error: "Email service rejected the message." };
    await sendDirectMail({ ...message, senderName: "Hyderabad Founders Network" });
    return { sent: true };
  } catch (error) {
    console.error("[jury-invitation] Email delivery failed:", error instanceof Error ? error.message : error);
    return { sent: false, error: "Invitation email could not be delivered." };
  }
}
