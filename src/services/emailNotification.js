const EMAIL_SERVICE_URL =
  process.env.EMAIL_SERVICE_URL || "http://localhost:4007";
const EMAIL_SERVICE_AUTH_TOKEN = process.env.EMAIL_SERVICE_AUTH_TOKEN || "";
const WEB_APP_URL = process.env.WEB_APP_URL || "https://ty.trizenventures.com";

/**
 * Fire-and-forget RSVP confirmation email.
 * Registration should still succeed even if email delivery fails.
 */
export async function sendRsvpConfirmationEmail({ rsvp, mapsUrl }) {
  if (!EMAIL_SERVICE_AUTH_TOKEN) {
    console.warn(
      "[email] Skipping confirmation — EMAIL_SERVICE_AUTH_TOKEN is not set.",
    );
    return;
  }

  const eventSlug = rsvp.event?.slug || "";
  const eventUrl = eventSlug
    ? `${WEB_APP_URL.replace(/\/$/, "")}/events/${eventSlug}`
    : WEB_APP_URL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(
      `${EMAIL_SERVICE_URL.replace(/\/$/, "")}/api/v1/email/rsvp-confirmation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Auth": EMAIL_SERVICE_AUTH_TOKEN,
          "X-Service-Name": "hfn-rsvp-backend",
        },
        body: JSON.stringify({
          email: rsvp.email,
          name: rsvp.name,
          eventSlug,
          eventTitle: rsvp.event?.title,
          dateLabel: rsvp.event?.dateLabel,
          time: rsvp.event?.time,
          venue: rsvp.event?.venue,
          city: rsvp.event?.city,
          format: rsvp.event?.format,
          mapsUrl: mapsUrl || "",
          eventUrl,
          supportEmail: "community@trizenventures.com",
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(
        "[email] Confirmation send failed:",
        data.error || res.statusText,
      );
      return;
    }

    console.log("[email] RSVP confirmation sent to", rsvp.email);
  } catch (err) {
    console.error(
      "[email] Confirmation request error:",
      err instanceof Error ? err.message : err,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Replace {{name}}, {{email}}, etc. in a template string. */
export function applyEmailTemplate(template, vars = {}) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

/**
 * Send custom reminder / announcement emails via the email microservice.
 * Supports merge tags: {{name}}, {{email}}, {{company}}, {{eventTitle}},
 * {{eventDate}}, {{eventTime}}, {{venue}}.
 */
export async function sendCustomEmails({
  subject,
  body,
  recipients,
  attachments = [],
}) {
  if (!EMAIL_SERVICE_AUTH_TOKEN) {
    throw new Error(
      "EMAIL_SERVICE_AUTH_TOKEN is not configured. Cannot send emails.",
    );
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
        results.push({
          email: recipient.email,
          name: recipient.name,
          rsvpId: recipient.rsvpId,
          status: "failed",
          error: data.error || res.statusText || "Send failed",
        });
      } else {
        results.push({
          email: recipient.email,
          name: recipient.name,
          rsvpId: recipient.rsvpId,
          status: "sent",
          error: "",
        });
      }
    } catch (err) {
      results.push({
        email: recipient.email,
        name: recipient.name,
        rsvpId: recipient.rsvpId,
        status: "failed",
        error: err instanceof Error ? err.message : "Send error",
      });
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
