/**
 * Shared email design system for Hackathon emails.
 *
 * Templates describe their content as a list of blocks; renderHackathonEmail
 * turns the same blocks into the HTML and the plain-text version so the two
 * never drift apart. The HTML is table-based with inline styles, an
 * Outlook-only fixed-width wrapper and VML buttons, so it holds up in the
 * Word rendering engine as well as Gmail, Apple Mail and mobile clients.
 */

export const EMAIL_BRAND = Object.freeze({
  name: "Trizen Community",
  supportEmail: process.env.TRIZEN_SUPPORT_EMAIL || "community@trizenventures.com",
  supportPhone: "+91 86396 48822",
  websiteUrl: (process.env.WEB_APP_URL || "https://ty.trizenventures.com").replace(/\/$/, ""),
  logoUrl: process.env.EMAIL_LOGO_URL || "",
});

const COLORS = {
  primary: "#1e1b4b",
  accent: "#5b4cf5",
  accentSoft: "#eef0ff",
  canvas: "#f8f9fc",
  border: "#e8eaf0",
  text: "#0f172a",
  body: "#334155",
  secondary: "#64748b",
  muted: "#94a3b8",
  white: "#ffffff",
};

const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
const CONTENT_PADDING = 32;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textStyle({ size = 15, lineHeight = 24, color = COLORS.body, weight = 400, extra = "" } = {}) {
  return `font-family:${FONT};font-size:${size}px;line-height:${lineHeight}px;color:${color};font-weight:${weight};mso-line-height-rule:exactly;${extra}`;
}

// ── Inline content ───────────────────────────────────────────────────────────
// Content is a string or an array of strings and inline segments.

export const strong = (value) => ({ strong: String(value ?? "") });
export const muted = (value) => ({ muted: String(value ?? "") });
export const link = (url, label) => ({ link: String(url || ""), label: String(label || url || "") });

function toSegments(content) {
  if (content == null || content === false) return [];
  return (Array.isArray(content) ? content : [content]).flat(Infinity).filter((part) => part != null && part !== false && part !== "");
}

function inlineHtml(content) {
  return toSegments(content)
    .map((part) => {
      if (typeof part === "string") return esc(part);
      if ("strong" in part) return `<strong style="color:${COLORS.text};font-weight:700;">${esc(part.strong)}</strong>`;
      if ("muted" in part) return `<span style="color:${COLORS.secondary};font-weight:400;">${esc(part.muted)}</span>`;
      if ("link" in part) {
        return `<a href="${esc(part.link)}" target="_blank" style="color:${COLORS.accent};text-decoration:underline;">${esc(part.label)}</a>`;
      }
      return "";
    })
    .join("");
}

function inlineText(content) {
  return toSegments(content)
    .map((part) => {
      if (typeof part === "string") return part;
      if ("strong" in part) return part.strong;
      if ("muted" in part) return part.muted;
      if ("link" in part) {
        const target = part.link.replace(/^mailto:/, "");
        return part.label === part.link || part.label === target ? target : `${part.label} (${target})`;
      }
      return "";
    })
    .join("");
}

function hasContent(content) {
  return inlineText(content).trim().length > 0;
}

// ── Date formatting ──────────────────────────────────────────────────────────

const IST = "Asia/Kolkata";

/** "7:40 PM IST on October 1, 2026" */
export function formatAbsoluteExpiry(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: IST });
  const day = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: IST });
  return `${time} IST on ${day}`;
}

/** "October 8, 2026" in IST */
export function formatDateIst(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: IST });
}

// ── HTML components ──────────────────────────────────────────────────────────

function row(innerHtml, { bottom = 16, top = 0 } = {}) {
  return `<tr>
<td class="tc-pad" style="padding:${top}px ${CONTENT_PADDING}px ${bottom}px ${CONTENT_PADDING}px;">
${innerHtml}
</td>
</tr>`;
}

function preheaderHtml(preheader) {
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${COLORS.canvas};">${esc(preheader)}${filler}</div>`;
}

function headerHtml() {
  const wordmark = `<td valign="middle" style="${textStyle({ size: 14, lineHeight: 24, color: COLORS.white, weight: 700, extra: "letter-spacing:2px;text-transform:uppercase;" })}">${esc(EMAIL_BRAND.name)}</td>`;
  const logo = EMAIL_BRAND.logoUrl
    ? `<td valign="middle" width="44" style="width:44px;padding-right:12px;"><img src="${esc(EMAIL_BRAND.logoUrl)}" width="32" height="28" alt="${esc(EMAIL_BRAND.name)}" style="display:block;width:32px;height:28px;border:0;outline:none;text-decoration:none;"></td>`
    : "";
  return `<tr>
<td class="tc-pad" bgcolor="${COLORS.primary}" style="background-color:${COLORS.primary};padding:20px ${CONTENT_PADDING}px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>${logo}${wordmark}</tr>
</table>
</td>
</tr>`;
}

function footerHtml(footerNote) {
  const support = [
    `<a href="mailto:${esc(EMAIL_BRAND.supportEmail)}" style="color:${COLORS.accent};text-decoration:none;">${esc(EMAIL_BRAND.supportEmail)}</a>`,
    EMAIL_BRAND.supportPhone ? esc(EMAIL_BRAND.supportPhone) : "",
  ]
    .filter(Boolean)
    .join(" &middot; ");
  return `<tr>
<td class="tc-pad" bgcolor="${COLORS.canvas}" style="background-color:${COLORS.canvas};border-top:1px solid ${COLORS.border};padding:20px ${CONTENT_PADDING}px 24px ${CONTENT_PADDING}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
<tr><td style="${textStyle({ size: 13, lineHeight: 20, color: COLORS.text, weight: 700 })}">${esc(EMAIL_BRAND.name)}</td></tr>
${footerNote ? `<tr><td style="padding-top:4px;${textStyle({ size: 12, lineHeight: 18, color: COLORS.secondary })}">${inlineHtml(footerNote)}</td></tr>` : ""}
<tr><td style="padding-top:8px;${textStyle({ size: 12, lineHeight: 18, color: COLORS.secondary })}">Need help? ${support}</td></tr>
</table>
</td>
</tr>`;
}

function cardHtml(rows) {
  const cells = rows
    .map((item, index) => {
      const divider = index === 0 ? "" : `border-top:1px solid ${COLORS.border};`;
      const value = Array.isArray(item.lines)
        ? item.lines.map((line) => inlineHtml(line)).join("<br>")
        : inlineHtml(item.value);
      return `<tr>
<td width="112" valign="top" style="width:112px;padding:10px 12px 10px 0;${divider}${textStyle({ size: 11, lineHeight: 20, color: COLORS.secondary, weight: 700, extra: "letter-spacing:0.6px;text-transform:uppercase;" })}">${esc(item.label)}</td>
<td valign="top" style="padding:10px 0;${divider}${textStyle({ size: 14, lineHeight: 20, color: COLORS.text, weight: 600, extra: "word-break:break-word;" })}">${value}</td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.canvas}" style="width:100%;background-color:${COLORS.canvas};border:1px solid ${COLORS.border};">
<tr><td style="padding:6px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
${cells}
</table>
</td></tr>
</table>`;
}

function buttonHtml(url, label) {
  const href = esc(url);
  const text = esc(label);
  const vmlWidth = Math.max(200, Math.round(String(label).length * 9.5) + 64);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="tc-btn" style="margin:0 auto;">
<tr>
<td align="center" bgcolor="${COLORS.accent}" height="46" style="height:46px;background-color:${COLORS.accent};mso-padding-alt:0;">
<!--[if mso]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:${vmlWidth}px;" stroke="f" fillcolor="${COLORS.accent}">
<w:anchorlock/>
<center style="color:${COLORS.white};font-family:${FONT};font-size:15px;font-weight:bold;">${text}</center>
</v:rect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${href}" target="_blank" style="display:block;padding:13px 32px;${textStyle({ size: 15, lineHeight: 20, color: COLORS.white, weight: 700, extra: `text-decoration:none;text-align:center;background-color:${COLORS.accent};` })}">${text}</a>
<!--<![endif]-->
</td>
</tr>
</table>`;
}

/** Inserts <wbr> break opportunities so long token URLs wrap without changing the copied text. */
function breakableUrl(url) {
  return (String(url).match(/[\s\S]{1,20}/g) || []).map(esc).join("<wbr>");
}

function fallbackHtml(url) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
<tr><td style="${textStyle({ size: 13, lineHeight: 20, color: COLORS.secondary })}">If the button above doesn't work, copy and paste this link into your browser:</td></tr>
<tr><td style="padding-top:6px;${textStyle({ size: 12, lineHeight: 18, color: COLORS.accent, extra: "word-break:break-all;word-wrap:break-word;overflow-wrap:break-word;-ms-word-break:break-all;" })}"><a href="${esc(url)}" target="_blank" style="color:${COLORS.accent};text-decoration:underline;word-break:break-all;">${breakableUrl(url)}</a></td></tr>
</table>`;
}

function stepsHtml(title, items) {
  const rows = items
    .map(
      (item, index) => `<tr>
<td width="28" valign="top" style="width:28px;padding:0 0 10px 0;${textStyle({ size: 14, lineHeight: 22, color: COLORS.accent, weight: 700 })}">${index + 1}.</td>
<td valign="top" style="padding:0 0 10px 0;${textStyle({ size: 14, lineHeight: 22 })}">${inlineHtml(item)}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
${title ? `<tr><td colspan="2" style="padding:0 0 10px 0;${textStyle({ size: 11, lineHeight: 16, color: COLORS.secondary, weight: 700, extra: "letter-spacing:1px;text-transform:uppercase;" })}">${esc(title)}</td></tr>` : ""}
${rows}
</table>`;
}

function calloutHtml(content) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.accentSoft}" style="width:100%;background-color:${COLORS.accentSoft};">
<tr><td style="padding:14px 16px;border-left:3px solid ${COLORS.accent};${textStyle({ size: 14, lineHeight: 22 })}">${inlineHtml(content)}</td></tr>
</table>`;
}

function dividerHtml() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
<tr><td height="1" bgcolor="${COLORS.border}" style="height:1px;font-size:1px;line-height:1px;background-color:${COLORS.border};mso-line-height-rule:exactly;">&nbsp;</td></tr>
</table>`;
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function normalizeCardRows(rows = []) {
  return rows
    .map((item) => {
      if (!item) return null;
      if (Array.isArray(item.lines)) {
        const lines = item.lines.filter(hasContent);
        return lines.length ? { label: item.label, lines } : null;
      }
      return hasContent(item.value) ? { label: item.label, value: item.value } : null;
    })
    .filter(Boolean);
}

function blockHtml(block) {
  switch (block.type) {
    case "greeting":
    case "paragraph":
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="${textStyle()}">${inlineHtml(block.type === "greeting" ? greetingText(block.name) : block.content)}</td></tr></table>`);
    case "note":
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="${textStyle({ size: 13, lineHeight: 20, color: COLORS.secondary })}">${inlineHtml(block.content)}</td></tr></table>`);
    case "card":
      return row(cardHtml(block.rows), { bottom: 24, top: 8 });
    case "button":
      return row(buttonHtml(block.url, block.label), { bottom: 16, top: 8 });
    case "steps":
      return row(stepsHtml(block.title, block.items), { bottom: 10 });
    case "callout":
      return row(calloutHtml(block.content), { bottom: 20, top: 4 });
    case "fallback":
      return row(fallbackHtml(block.url), { bottom: 8 });
    case "divider":
      return row(dividerHtml(), { bottom: 20, top: 8 });
    default:
      return "";
  }
}

function blockText(block) {
  switch (block.type) {
    case "greeting":
      return greetingText(block.name);
    case "paragraph":
    case "note":
    case "callout":
      return inlineText(block.content);
    case "card":
      return block.rows
        .map((item) =>
          Array.isArray(item.lines)
            ? `${item.label}:\n${item.lines.map((line) => `  - ${inlineText(line)}`).join("\n")}`
            : `${item.label}: ${inlineText(item.value)}`,
        )
        .join("\n");
    case "button":
      return `${block.label}:\n${block.url}`;
    case "steps":
      return [block.title ? block.title.toUpperCase() : "", ...block.items.map((item, index) => `${index + 1}. ${inlineText(item)}`)]
        .filter(Boolean)
        .join("\n");
    default:
      return "";
  }
}

function greetingText(name) {
  const clean = String(name || "").trim();
  return clean ? `Hi ${clean},` : "Hello,";
}

function prepareBlocks(blocks) {
  return blocks
    .filter(Boolean)
    .map((block) => (block.type === "card" ? { ...block, rows: normalizeCardRows(block.rows) } : block))
    .filter((block) => {
      if (block.type === "card") return block.rows.length > 0;
      if (block.type === "button" || block.type === "fallback") return Boolean(block.url);
      if (block.type === "steps") return block.items.length > 0;
      if (block.type === "paragraph" || block.type === "note" || block.type === "callout") return hasContent(block.content);
      return true;
    });
}

// ── Document ─────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   subject: string,
 *   preheader: string,
 *   eyebrow?: string,
 *   heading: string,
 *   blocks: Array<object|false|null>,
 *   footerNote?: string | Array<string|object>,
 * }} email
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderHackathonEmail({ subject, preheader, eyebrow = "", heading, blocks, footerNote = "" }) {
  const content = prepareBlocks(blocks);
  const eyebrowRow = eyebrow
    ? `<tr><td class="tc-pad" style="padding:28px ${CONTENT_PADDING}px 6px ${CONTENT_PADDING}px;${textStyle({ size: 11, lineHeight: 16, color: COLORS.accent, weight: 700, extra: "letter-spacing:1.5px;text-transform:uppercase;" })}">${esc(eyebrow)}</td></tr>`
    : "";
  const headingRow = `<tr><td class="tc-pad" style="padding:${eyebrow ? 0 : 28}px ${CONTENT_PADDING}px 16px ${CONTENT_PADDING}px;"><h1 style="margin:0;${textStyle({ size: 22, lineHeight: 30, color: COLORS.text, weight: 700 })}">${esc(heading)}</h1></td></tr>`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,th,p,a,span,h1{font-family:'Segoe UI',Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
<style>
body{margin:0 !important;padding:0 !important;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
@media only screen and (max-width:620px){
.tc-outer{padding:16px 8px !important;}
.tc-pad{padding-left:20px !important;padding-right:20px !important;}
.tc-btn{width:100% !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.canvas};">
${preheaderHtml(preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.canvas}" style="width:100%;background-color:${COLORS.canvas};">
<tr>
<td align="center" class="tc-outer" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;"><tr><td><![endif]-->
<table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.white}" style="width:100%;max-width:600px;background-color:${COLORS.white};border:1px solid ${COLORS.border};">
${headerHtml()}
${eyebrowRow}
${headingRow}
${content.map(blockHtml).join("\n")}
<tr><td height="16" style="height:16px;font-size:16px;line-height:16px;">&nbsp;</td></tr>
${footerHtml(footerNote)}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>`;

  const footerText = [
    "—",
    EMAIL_BRAND.name,
    footerNote ? inlineText(footerNote) : "",
    `Need help? ${[EMAIL_BRAND.supportEmail, EMAIL_BRAND.supportPhone].filter(Boolean).join(" · ")}`,
  ].filter(Boolean);
  const text = [
    [EMAIL_BRAND.name.toUpperCase(), eyebrow].filter(Boolean).join("\n"),
    heading,
    ...content.map(blockText).filter((part) => part && part.trim()),
    footerText.join("\n"),
  ].join("\n\n");

  return { subject, html, text };
}
