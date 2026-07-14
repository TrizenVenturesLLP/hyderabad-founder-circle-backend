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
