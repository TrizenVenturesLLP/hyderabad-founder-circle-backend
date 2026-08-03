/**
 * Direct SMTP mailer — used as fallback when the email microservice is unreachable.
 * Mirrors the SMTP config in hfn_email_service/src/services/smtp.js.
 */
import nodemailer from "nodemailer";

function createTransporter() {
  const host = (process.env.SMTP_HOST || "").toLowerCase();
  const isMicrosoft =
    host.includes("outlook") ||
    host.includes("office365") ||
    host.includes("hotmail") ||
    host.includes("microsoft");

  const config = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
    maxConnections: isMicrosoft ? 10 : 5,
    maxMessages: isMicrosoft ? 500 : 100,
    rateDelta: 1000,
    rateLimit: isMicrosoft ? 30 : 10,
  };

  if (isMicrosoft) {
    config.requireTLS = true;
    config.tls = { ciphers: "SSLv3", rejectUnauthorized: false };
    config.connectionTimeout = 10000;
    config.greetingTimeout = 5000;
    config.socketTimeout = 15000;
  }

  return nodemailer.createTransport(config);
}

let _transporter = null;
function getTransporter() {
  if (!_transporter) _transporter = createTransporter();
  return _transporter;
}

/**
 * @param {{ to: string, subject: string, html: string, text: string, attachments?: any[] }} opts
 */
export async function sendDirectMail({ to, subject, html, text, attachments }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP credentials are not configured.");
  }

  const info = await getTransporter().sendMail({
    from: {
      name: process.env.EMAIL_FROM_NAME || "Hyderabad Founders Network",
      address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER,
    },
    replyTo: process.env.EMAIL_REPLY_TO || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
    attachments: Array.isArray(attachments)
      ? attachments
          .filter((a) => a && (a.content || a.path))
          .map((a) => ({
            filename: a.filename || "attachment",
            contentType: a.contentType || "application/octet-stream",
            content: a.content ? Buffer.from(String(a.content), "base64") : undefined,
            path: a.path,
          }))
      : undefined,
    headers: { "X-Mailer": "HFN RSVP Backend" },
  });

  return { success: true, messageId: info.messageId || "" };
}
