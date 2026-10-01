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

/** True when the body is already full HTML (admin pasted a template). */
export function looksLikeHtmlEmail(body) {
  const t = String(body || "").trim();
  return (
    /^<!DOCTYPE\b/i.test(t) ||
    /^<html[\s>]/i.test(t) ||
    /^<(?:div|table|section|article|p|h[1-6]|br|span|strong|em)\b/i.test(t)
  );
}

/**
 * Convert structured plain text / light markdown into email-safe HTML.
 * Preserves blank lines as paragraphs, single newlines as <br>,
 * **bold**, [label](url), and bare https:// links.
 */
export function formatStructuredBodyToHtml(raw) {
  let text = esc(raw).replace(/\r\n/g, "\n");

  // Markdown links: [label](https://...)
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    '<a href="$2" style="color:#c46a3a;text-decoration:underline;word-break:break-all;">$1</a>',
  );

  // Bare URLs (skip ones already inside href=")
  text = text.replace(
    /(^|[\s>(])((https?:\/\/)[^\s<]+)/gi,
    (match, prefix, url) => {
      const clean = url.replace(/[),.;!?]+$/, "");
      const trailing = url.slice(clean.length);
      return `${prefix}<a href="${clean}" style="color:#c46a3a;text-decoration:underline;word-break:break-all;">${clean}</a>${trailing}`;
    },
  );

  // Bold: **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;">${block.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  return paragraphs || `<p style="margin:0;color:#374151;font-size:15px;line-height:1.65;"></p>`;
}

/**
 * Branded wrapper used for admin reminder / announcement emails so structure
 * renders consistently across Gmail, Outlook, and Apple Mail.
 */
export function wrapAdminEmailHtml({ title = "Hyderabad Founders Network", bodyHtml }) {
  const heading = esc(title);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08);">
<tr><td style="background:#1f1a17;color:#fff;padding:14px 24px;font-size:13px;letter-spacing:.08em;text-align:center;text-transform:uppercase;">${heading}</td></tr>
<tr><td style="padding:28px 32px 8px;">
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px 22px;text-align:center;border-top:1px solid #eee7dc;color:#9a9188;font-size:12px;line-height:1.5;">
  Community-owned · Supported by Trizen Ventures<br>
  <a href="mailto:community@trizenventures.com" style="color:#c46a3a;text-decoration:none;">community@trizenventures.com</a>
  · +91 86396 48822
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Build a reminder email from structured plain text (or pass-through HTML).
 */
export function buildAdminCustomEmail({ subject, body }) {
  const htmlBody = looksLikeHtmlEmail(body)
    ? String(body)
    : wrapAdminEmailHtml({
        title: subject || "Hyderabad Founders Network",
        bodyHtml: formatStructuredBodyToHtml(body),
      });

  const text = looksLikeHtmlEmail(body)
    ? String(body)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim()
    : String(body)
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1 ($2)")
        .trim();

  return { subject: String(subject || "").trim(), html: htmlBody, text };
}

function formatIstDate(value) {
  return value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "";
}

function hackathonEmailShell({ subject, heading, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f3f8;font-family:Arial,Helvetica,sans-serif;color:#20213a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f3f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e5ed;">
        <tr><td style="padding:22px 28px;background:#24204f;color:#ffffff;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#d8d4ff;">Trizen Ventures · Hackathon</p>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.2;color:#ffffff;">${esc(heading)}</h1>
        </td></tr>
        <tr><td style="padding:28px;">
${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafafe;border-top:1px solid #ececf2;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#777b94;">Hyderabad Founders Network · Supported by Trizen Ventures</p>
          <a href="mailto:community@trizenventures.com" style="font-size:12px;line-height:1.8;color:#5146a8;text-decoration:none;">community@trizenventures.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function hackathonEmailButton(url, label) {
  const safeUrl = esc(url || "");
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 20px;">
            <tr><td align="center" bgcolor="#5146a8">
              <a href="${safeUrl}" style="display:inline-block;padding:13px 24px;border:1px solid #5146a8;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${esc(label)}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 7px;font-size:12px;line-height:1.5;color:#777b94;">Button not working? Copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all;"><a href="${safeUrl}" style="color:#5146a8;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${safeUrl}</a></p>`;
}

export function buildHackathonRegistrationConfirmationEmail({
  name,
  teamName,
  leadEmail,
  members = [],
  actionUrl,
  hasPassword = false,
  expiresAt,
}) {
  const subject = `Registration confirmed: ${teamName || "your team"}`;
  const expiry = formatIstDate(expiresAt);
  const memberRows = members
    .map(
      (member) =>
        `<li style="margin:0 0 4px;">${esc(member.full_name)} <span style="color:#777b94;">(${esc(member.email)})</span></li>`,
    )
    .join("");
  const passwordCopy = hasPassword
    ? `You already have a password for this hackathon. Sign in with <strong style="color:#20213a;">${esc(leadEmail)}</strong> and your existing password.`
    : `To sign in to your team dashboard, set a password for <strong style="color:#20213a;">${esc(leadEmail)}</strong> using the button below.${expiry ? ` This link expires on <strong style="color:#20213a;">${esc(expiry)} IST</strong> and can be used once.` : ""}`;

  const bodyHtml = `          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">Hi ${esc(name || "there")},</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#51556d;">Your team <strong style="color:#20213a;">${esc(teamName || "")}</strong> is registered for the hackathon. You are the Team Lead.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f7f7fb;border:1px solid #e6e7ef;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#777b94;">Your team</p>
              <p style="margin:0 0 10px;font-size:18px;font-weight:700;color:#24204f;">${esc(teamName || "")}</p>
              ${memberRows ? `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#51556d;">${memberRows}</ul>` : ""}
            </td></tr>
          </table>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#51556d;">${passwordCopy}</p>
          ${hackathonEmailButton(actionUrl, hasPassword ? "Sign in" : "Set your password")}
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#51556d;">Your team members get an email letting them know they've joined. Only you, as Team Lead, sign in to the team dashboard.</p>`;

  const text = [
    `Hi ${name || "there"},`,
    "",
    `Your team ${teamName || ""} is registered for the hackathon.`,
    "",
    ...members.map((member) => `- ${member.full_name} (${member.email})`),
    "",
    hasPassword
      ? `Sign in with ${leadEmail} and your existing password: ${actionUrl || ""}`
      : `Set your password for ${leadEmail}: ${actionUrl || ""}${expiry ? `\nThis link expires on ${expiry} IST.` : ""}`,
    "",
    "Hyderabad Founders Network",
    "community@trizenventures.com",
  ].join("\n");

  return {
    subject,
    html: hackathonEmailShell({ subject, heading: "Your team is registered", bodyHtml }),
    text,
  };
}

export function buildHackathonPasswordSetupEmail({ name, teamName, email, setupUrl, expiresAt }) {
  const subject = "Set your hackathon password";
  const expiry = formatIstDate(expiresAt);
  const bodyHtml = `          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">Hi ${esc(name || "there")},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#51556d;">Use the button below to set a new password for <strong style="color:#20213a;">${esc(email)}</strong>${teamName ? ` (team <strong style="color:#20213a;">${esc(teamName)}</strong>)` : ""}.${expiry ? ` This link expires on <strong style="color:#20213a;">${esc(expiry)} IST</strong> and can be used once.` : ""}</p>
          ${hackathonEmailButton(setupUrl, "Set your password")}
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#51556d;">Didn't ask for this? You can ignore this email; your current password stays the same.</p>`;
  const text = [
    `Hi ${name || "there"},`,
    "",
    `Set your hackathon password for ${email}: ${setupUrl || ""}`,
    expiry ? `This link expires on ${expiry} IST.` : "",
    "",
    "Didn't ask for this? You can ignore this email.",
    "",
    "Hyderabad Founders Network",
    "community@trizenventures.com",
  ].join("\n");

  return {
    subject,
    html: hackathonEmailShell({ subject, heading: "Set your password", bodyHtml }),
    text,
  };
}

export function buildHackathonTeamInvitationEmail({
  name,
  teamName,
  teamLead,
  teamLeadEmail,
  memberEmail,
  hackathonUrl,
}) {
  const safeName = esc(name || "there");
  const safeTeamName = esc(teamName || "your hackathon team");
  const safeTeamLead = esc(teamLead || "Your team lead");
  const safeLeadEmail = esc(teamLeadEmail || "");
  const safeUrl = esc(hackathonUrl || "");
  const accessCopy = `You were added with <strong style="color:#20213a;">${esc(memberEmail || "")}</strong>. ${safeTeamLead} signs in to the team dashboard to choose the problem statement and submit the project, so you don't need to sign in.`;
  const buttonLabel = "View hackathon details";
  const subject = `You're invited to join ${teamName || "a team"} at the hackathon`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f3f8;font-family:Arial,Helvetica,sans-serif;color:#20213a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f3f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e5ed;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:22px 28px;background:#24204f;color:#ffffff;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#d8d4ff;">Trizen Ventures · Hackathon</p>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.2;color:#ffffff;">You're on the team</h1>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">Hi ${safeName},</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#51556d;">${safeTeamLead} invited you to join <strong style="color:#20213a;">${safeTeamName}</strong>. You're one of the team members for the hackathon.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f7f7fb;border:1px solid #e6e7ef;border-radius:8px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#777b94;">Your team</p>
              <p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#24204f;">${safeTeamName}</p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#51556d;">Team lead: <strong style="color:#20213a;">${safeTeamLead}</strong><br>Email: <a href="mailto:${safeLeadEmail}" style="color:#5146a8;text-decoration:underline;overflow-wrap:anywhere;">${safeLeadEmail}</a></p>
            </td></tr>
          </table>
          <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#51556d;">${accessCopy}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 20px;">
            <tr><td align="center" bgcolor="#5146a8" style="border-radius:6px;">
              <a href="${safeUrl}" style="display:inline-block;padding:13px 24px;border:1px solid #5146a8;border-radius:6px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${buttonLabel}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 7px;font-size:12px;line-height:1.5;color:#777b94;">Button not working? Copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all;"><a href="${safeUrl}" style="color:#5146a8;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${safeUrl}</a></p>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#51556d;">We look forward to building with you.</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafafe;border-top:1px solid #ececf2;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#777b94;">Hyderabad Founders Network · Supported by Trizen Ventures</p>
          <a href="mailto:community@trizenventures.com" style="font-size:12px;line-height:1.8;color:#5146a8;text-decoration:none;">community@trizenventures.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = [
    `Hi ${name || "there"},`,
    "",
    `${teamLead || "Your team lead"} invited you to join ${teamName || "your hackathon team"}.`,
    "",
    `Team: ${teamName || ""}`,
    `Team lead: ${teamLead || ""}`,
    `Team lead email: ${teamLeadEmail || ""}`,
    `Your email: ${memberEmail || ""}`,
    "",
    `${teamLead || "Your team lead"} signs in to the team dashboard, so you don't need to sign in.`,
    `Hackathon details: ${hackathonUrl || ""}`,
    "",
    "Hyderabad Founders Network",
    "community@trizenventures.com",
  ].join("\n");

  return { subject, html, text };
}

export function buildHackathonJuryInvitationEmail({
  name,
  hackathonName,
  invitationUrl,
  expiresAt,
}) {
  const safeName = esc(name || "there");
  const safeHackathonName = esc(hackathonName || "the hackathon");
  const safeUrl = esc(invitationUrl || "");
  const expiration = expiresAt
    ? new Date(expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "the stated expiry date";
  const subject = `Jury invitation: ${hackathonName || "Hackathon"}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:28px 12px;background:#f4f4f8;font-family:Arial,Helvetica,sans-serif;color:#20213a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e3e5ed">
      <tr><td style="padding:24px;background:#24204f;color:#fff"><p style="margin:0;font-size:12px">Trizen Community · Hackathon Jury</p><h1 style="margin:12px 0 0;font-size:24px">You're invited to serve as a Jury member</h1></td></tr>
      <tr><td style="padding:28px"><p>Hi ${safeName},</p><p>You have been invited to review teams and submissions for <strong>${safeHackathonName}</strong>.</p><p>This invitation expires on <strong>${esc(expiration)} IST</strong>. The link can be accepted once and is tied to your email address.</p>
        <p style="text-align:center;margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:13px 22px;background:#5146a8;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a></p>
        <p style="font-size:12px;color:#65697c;overflow-wrap:anywhere">If the button does not work, open this link:<br><a href="${safeUrl}">${safeUrl}</a></p>
        <p>Questions? Contact <a href="mailto:community@trizenventures.com">community@trizenventures.com</a>.</p>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#fafafe;border-top:1px solid #ececf2;font-size:12px;color:#777b94">Hyderabad Founders Network · Supported by Trizen Ventures</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const text = [
    `Hi ${name || "there"},`,
    `You are invited to serve as a Jury member for ${hackathonName || "the hackathon"}.`,
    `This invitation expires on ${expiration} IST.`,
    `Accept invitation: ${invitationUrl || ""}`,
    "Questions? community@trizenventures.com",
  ].join("\n\n");
  return { subject, html, text };
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

export function buildPaymentReviewEmail(data) {
  const name = esc(data.name || "there");
  const eventTitle = esc(data.eventTitle || "your event");
  const subject = `Application received — ${data.eventTitle || "Event registration"}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#1f1a17;color:#fff;padding:14px 24px;font-size:13px;letter-spacing:.08em;text-align:center;text-transform:uppercase;">${eventTitle}</td></tr>
<tr><td style="padding:30px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#1f1a17;">Your application is under review</h1>
<p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">Hi ${name},</p>
<p style="margin:0 0 18px;color:#374151;font-size:16px;line-height:1.6;">We received your registration application and payment proof for <strong>${eventTitle}</strong>.</p>
<p style="margin:0;color:#374151;font-size:16px;line-height:1.6;">Our team will verify the payment. You will receive a separate registration confirmation email after your application is approved.</p>
</td></tr>
<tr><td style="padding:16px 24px;text-align:center;border-top:1px solid #eee7dc;color:#9a9188;font-size:12px;">Please keep this email for your records.</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [
    `Hi ${data.name || "there"},`,
    "",
    `We received your registration application and payment proof for ${data.eventTitle || "the event"}.`,
    "Your application is under review. Our team will verify the payment.",
    "You will receive a separate registration confirmation email after approval.",
  ].join("\n");
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
