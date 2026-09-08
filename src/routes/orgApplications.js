import { Router } from "express";
import { OrgApplication } from "../models/OrgApplication.js";
import { Admin } from "../models/Admin.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const organizationName = String(req.body?.organizationName || "").trim();
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const contactName =
      String(req.body?.contactName || "").trim() || organizationName;
    const phone = String(req.body?.phone || "").trim();
    const website = String(req.body?.website || "").trim();
    const message = String(req.body?.message || "").trim().slice(0, 800);

    if (!organizationName || !email) {
      return res.status(400).json({
        error: "Organization name and organization email are required.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email." });
    }

    const existingAccount = await Admin.findOne({ email }).lean();
    if (existingAccount) {
      return res.status(409).json({
        error:
          "An account with this email already exists. Use Organization login instead.",
      });
    }

    const pending = await OrgApplication.findOne({
      email,
      status: "pending",
    }).lean();
    if (pending) {
      return res.status(409).json({
        error:
          "You already have a pending application. Our team will review it soon.",
      });
    }

    const item = await OrgApplication.create({
      organizationName,
      contactName,
      email,
      phone,
      website,
      message,
      status: "pending",
    });

    return res.status(201).json({
      ok: true,
      id: item._id,
      message:
        "Application submitted. We’ll review it before you can create events.",
    });
  } catch (err) {
    console.error("[org-applications POST]", err);
    return res.status(500).json({ error: "Could not submit application." });
  }
});

export default router;
