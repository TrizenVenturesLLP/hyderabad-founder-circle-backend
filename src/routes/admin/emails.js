import { Router } from "express";
import { Rsvp } from "../../models/Rsvp.js";
import { EmailLog } from "../../models/EmailLog.js";
import { requireAdmin } from "../../middleware/auth.js";
import { sendCustomEmails } from "../../services/emailNotification.js";

const router = Router();

router.use(requireAdmin);

router.get("/history", async (_req, res) => {
  try {
    const items = await EmailLog.find().sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ items });
  } catch (err) {
    console.error("[admin/emails/history]", err);
    return res.status(500).json({ error: "Could not load email history." });
  }
});

router.post("/reminder", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "").trim();
    const body = String(req.body?.body || "").trim();
    const rsvpIds = Array.isArray(req.body?.rsvpIds) ? req.body.rsvpIds : [];
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
      : [];
    const eventSlug = String(req.body?.eventSlug || "").trim();

    if (!subject) return res.status(400).json({ error: "Subject is required." });
    if (!body) return res.status(400).json({ error: "Email body is required." });
    if (rsvpIds.length === 0) {
      return res.status(400).json({ error: "Select at least one recipient." });
    }

    const rsvps = await Rsvp.find({ _id: { $in: rsvpIds } }).lean();
    if (rsvps.length === 0) {
      return res.status(404).json({ error: "No matching registrations found." });
    }

    const results = await sendCustomEmails({
      subject,
      body,
      recipients: rsvps.map((r) => ({
        email: r.email,
        name: r.name,
        company: r.company || "",
        eventTitle: r.event?.title || "",
        eventDate: r.event?.dateLabel || "",
        eventTime: r.event?.time || "",
        venue: r.event?.venue || "",
        rsvpId: String(r._id),
      })),
      attachments,
    });

    const successCount = results.filter((r) => r.status === "sent").length;
    const failureCount = results.length - successCount;

    await EmailLog.create({
      subject,
      body,
      eventSlug,
      recipientCount: results.length,
      recipients: results,
      attachmentNames: attachments.map((a) => a.filename || "attachment"),
      sentBy: req.admin?.email || "",
      successCount,
      failureCount,
    });

    return res.json({
      ok: failureCount === 0,
      successCount,
      failureCount,
      results,
    });
  } catch (err) {
    console.error("[admin/emails/reminder]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Could not send emails.",
    });
  }
});

export default router;
