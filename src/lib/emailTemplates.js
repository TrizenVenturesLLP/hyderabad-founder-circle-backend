/**
 * Inline email templates for direct SMTP sending from the backend.
 * Mirrors the templates in hfn_email_service.
 */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Registration Confirmation ─────────────────────────────────────────────────

export function buildRsvpConfirmationEmail(data) {
  const name = esc(data.name || "there");
  const eventTitle = esc(data.eventTitle || "Founders Open House");
  const dateLabel = esc(data.dateLabel || "");
  const time = esc(data.time || "");
  const venue = esc(data.venue || "");
  const space = esc(data.space || "");
  const address = esc(data.address || "");
  const format = esc(data.format || "Offline");
  const mapsUrl = data.mapsUrl || "";
  const eventUrl = data.eventUrl || "";
  const badgeUrl = data.badgeUrl || "";
  const communityUrl = data.communityUrl || "";
  const supportEmail = esc(data.supportEmail || "community@trizenventures.com");
  const whereLine = [venue, space, esc(data.city || "Hyderabad")].filter(Boolean).join(" · ");
  const subject = `You're registered — ${data.eventTitle || "Founders Open House"}`;

  function cta(href, label, style) {
    if (!href) return "";
    return `<a href="${esc(href)}" style="display:inline-block;${style}text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:14px;margin:0 6px 8px;">${label}</a>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08);">
<tr><td style="background:#1f1a17;color:#fff;padding:14px 24px;font-size:13px;letter-spacing:.08em;text-align:center;text-transform:uppercase;">Hyderabad Founders Network</td></tr>
<tr><td style="padding:28px 32px 12px;text-align:center;border-bottom:1px solid #eee7dc;">
  <h1 style="margin:0;font-size:24px;font-weight:700;color:#1f1a17;">You're on the list</h1>
  <p style="margin:8px 0 0;font-size:14px;color:#6b635a;">Registration confirmed for ${eventTitle}</p>
</td></tr>
<tr><td style="padding:28px 32px;">
  <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">Hi ${name},</p>
  <p style="margin:0 0 18px;color:#374151;font-size:16px;line-height:1.6;">Thanks for registering. Your seat is confirmed — we look forward to seeing you at the meetup.</p>
  <p style="margin:0 0 18px;color:#374151;font-size:16px;line-height:1.6;">Create a personalised attendance badge with your photo and share it on LinkedIn, WhatsApp or X — your photo stays on your device.</p>
  ${communityUrl ? `<p style="margin:0 0 18px;color:#374151;font-size:16px;line-height:1.6;">Join the WhatsApp community to get updates, venue notes and connect with other founders before the meetup.</p>` : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf7f2;border:1px solid #eee7dc;border-radius:10px;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9a6b45;"><strong>Event</strong></p>
      <p style="margin:0 0 14px;font-size:15px;color:#1f1a17;font-weight:600;">${eventTitle}</p>
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9a6b45;"><strong>When</strong></p>
      <p style="margin:0 0 14px;font-size:15px;color:#1f1a17;">${dateLabel}${time ? ` · ${time}` : ""}</p>
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9a6b45;"><strong>Where</strong></p>
      <p style="margin:0 0 ${address ? "6px" : "14px"};font-size:15px;color:#1f1a17;">${whereLine || "Hyderabad"}</p>
      ${address ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#6b635a;">${esc(address)}</p>` : ""}
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9a6b45;"><strong>Format</strong></p>
      <p style="margin:0;font-size:15px;color:#1f1a17;">${format}</p>
    </td></tr>
  </table>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;">
    <tr><td align="center">
      ${cta(badgeUrl, "Create &amp; share your badge", "background:#c46a3a;color:#fff !important;")}
      ${cta(eventUrl, "View event details", "background:#1f1a17;color:#fff !important;")}
      ${cta(mapsUrl, "Open in Maps", "background:#ffffff;color:#1f1a17 !important;border:1px solid #ddd4c8;")}
      ${cta(communityUrl, "Join WhatsApp community", "background:#25D366;color:#fff !important;")}
    </td></tr>
  </table>
  <p style="margin:22px 0 0;color:#6b635a;font-size:14px;line-height:1.6;">Questions? Reply to this email or write to <a href="mailto:${supportEmail}" style="color:#c46a3a;text-decoration:none;">${supportEmail}</a>.</p>
</td></tr>
<tr><td style="padding:16px 24px 22px;text-align:center;border-top:1px solid #eee7dc;color:#9a9188;font-size:12px;">Community-owned · Supported by Trizen Ventures</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Hi ${data.name || "there"},`,
    "",
    `You're registered for ${data.eventTitle || "Founders Open House"}.`,
    "Thanks for registering. Your seat is confirmed — we look forward to seeing you at the meetup.",
    "",
    `Event: ${data.eventTitle || ""}`,
    `When: ${data.dateLabel || ""}${data.time ? ` · ${data.time}` : ""}`,
    `Where: ${[data.venue, data.space, data.city].filter(Boolean).join(" · ")}`,
    data.address ? `Address: ${data.address}` : "",
    `Format: ${data.format || "Offline"}`,
    "",
    data.badgeUrl ? `Create & share your badge: ${data.badgeUrl}` : "",
    data.eventUrl ? `Event details: ${data.eventUrl}` : "",
    data.mapsUrl ? `Maps: ${data.mapsUrl}` : "",
    data.communityUrl ? `WhatsApp community: ${data.communityUrl}` : "",
    "",
    `Questions? Write to ${data.supportEmail || "community@trizenventures.com"}`,
  ]
    .filter((l) => l != null)
    .join("\n");

  return { subject, html, text };
}

// ── Invoice Email ─────────────────────────────────────────────────────────────

export function buildInvoiceEmail(data) {
  const name = esc(data.name || "User");
  const amountInr = Number(data.amountInr) || 0;
  const invoiceNumber = esc(data.invoiceNumber || "");
  const eventTitle = esc(data.eventTitle || "Founders Meetup");
  const eventDate = esc(data.eventDate || "");
  const eventTime = esc(data.eventTime || "");
  const eventVenue = esc(data.eventVenue || "Hyderabad");
  const transactionId = esc(data.razorpayPaymentId || "—");
  const subject = `Payment received — ${data.eventTitle || "Founders Meetup"}`;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f4;padding:20px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

<tr><td style="padding:28px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#1a1a1a;">Hi ${name},</h1>
  <p style="margin:0;font-size:15px;color:#666;line-height:1.5;">Thanks for your payment! Your registration is confirmed.</p>
</td></tr>

<tr><td style="padding:0 32px 32px;">

  <!-- Your Booking -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:20px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7c3aed;letter-spacing:.08em;text-transform:uppercase;">Your Booking</p>
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a1a;line-height:1.3;">${eventTitle}</h2>
      <p style="margin:0;font-size:13px;color:#999;">Transaction ${transactionId}</p>
    </td></tr>
  </table>

  <!-- Invoice No box -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#7c3aed;border-radius:8px;margin-bottom:20px;">
    <tr><td style="padding:18px 24px;text-align:center;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:rgba(255,255,255,.8);letter-spacing:.08em;text-transform:uppercase;">Invoice No.</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:.03em;">${invoiceNumber}</p>
    </td></tr>
  </table>

  <!-- Order Summary -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
    <tr><td>
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#999;letter-spacing:.08em;text-transform:uppercase;">Order Summary</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #e5e5e5;">
            <th style="padding:8px 0;text-align:left;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;">Ticket</th>
            <th style="padding:8px 0;text-align:center;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;">Qty</th>
            <th style="padding:8px 0;text-align:right;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:12px 0;font-size:14px;color:#1a1a1a;">Event Pass</td>
            <td style="padding:12px 0;text-align:center;font-size:14px;color:#1a1a1a;">1</td>
            <td style="padding:12px 0;text-align:right;font-size:14px;color:#1a1a1a;font-weight:600;">&#8377; ${amountInr.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;padding-top:10px;border-top:2px solid #e5e5e5;">
        <tr>
          <td style="padding:6px 0;font-size:15px;font-weight:700;color:#1a1a1a;">Amount paid (INR)</td>
          <td style="padding:6px 0;text-align:right;font-size:16px;font-weight:700;color:#1a1a1a;">&#8377; ${amountInr.toFixed(2)}</td>
        </tr>
      </table>
    </td></tr>
  </table>

  <!-- Event Details -->
  ${eventDate || eventVenue ? `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      ${eventDate ? `<div style="margin-bottom:${eventVenue ? "14px" : "0"};"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#999;letter-spacing:.06em;text-transform:uppercase;">When</p><p style="margin:0;font-size:14px;color:#1a1a1a;font-weight:500;">${eventDate}${eventTime ? `<br><span style="color:#666;font-weight:400;">${eventTime}</span>` : ""}</p></div>` : ""}
      ${eventVenue ? `<div><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#999;letter-spacing:.06em;text-transform:uppercase;">Venue</p><p style="margin:0;font-size:14px;color:#1a1a1a;font-weight:500;">${eventVenue}</p></div>` : ""}
    </td></tr>
  </table>
  ` : ""}

  <!-- Organizer + Help -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
    <tr><td>
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#999;letter-spacing:.08em;text-transform:uppercase;">Organizer</p>
      <p style="margin:0 0 18px;font-size:14px;color:#1a1a1a;font-weight:600;">Hyderabad Founders Network</p>
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#999;letter-spacing:.08em;text-transform:uppercase;">Need Help?</p>
      <p style="margin:0;font-size:13px;"><a href="mailto:community@trizenventures.com" style="color:#7c3aed;text-decoration:none;font-weight:500;">community@trizenventures.com</a></p>
    </td></tr>
  </table>

  <!-- Invoice attachment note -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fef9f0;border:1px solid #f3e5c7;border-radius:6px;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#92600b;line-height:1.5;">&#128206; <strong>Invoice attached</strong> — Your invoice (${invoiceNumber}) is attached to this email as a PDF.</p>
    </td></tr>
  </table>

</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 32px;text-align:center;background:#fafafa;border-top:1px solid #e5e5e5;">
  <p style="margin:0 0 6px;font-size:12px;color:#999;">You received this email because you registered on Hyderabad Founders Network.</p>
  <p style="margin:0;font-size:11px;color:#ccc;">&copy; ${year} Hyderabad Founders Network. All rights reserved.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Hi ${data.name || "User"},`,
    "",
    "Thanks for your payment! Your registration is confirmed.",
    "",
    "YOUR BOOKING",
    data.eventTitle || "",
    `Transaction: ${data.razorpayPaymentId || "—"}`,
    "",
    `INVOICE NO: ${data.invoiceNumber || ""}`,
    "",
    "ORDER SUMMARY",
    `Event Pass  x1  ₹ ${amountInr.toFixed(2)}`,
    `Amount paid (INR): ₹ ${amountInr.toFixed(2)}`,
    "",
    data.eventDate ? `WHEN: ${data.eventDate}` : "",
    data.eventTime ? data.eventTime : "",
    data.eventVenue ? `VENUE: ${data.eventVenue}` : "",
    "",
    "ORGANIZER: Hyderabad Founders Network",
    "NEED HELP? community@trizenventures.com",
    "",
    `Invoice attached — Your invoice (${data.invoiceNumber || ""}) is attached as a PDF.`,
  ]
    .filter((l) => l != null)
    .join("\n");

  return { subject, html, text };
}
