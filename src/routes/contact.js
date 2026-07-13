import { Router } from "express";
import { Contact } from "../models/Contact.js";

const router = Router();

const FIELD_LIMITS = {
  name: 100,
  email: 255,
  message: 2000,
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body ?? {};

    if (!isNonEmptyString(name) || name.trim().length > FIELD_LIMITS.name) {
      return res.status(400).json({ error: "Please enter a valid name." });
    }
    if (
      !isNonEmptyString(email) ||
      email.trim().length > FIELD_LIMITS.email ||
      !isValidEmail(email.trim())
    ) {
      return res.status(400).json({ error: "Please enter a valid email." });
    }
    if (
      !isNonEmptyString(message) ||
      message.trim().length > FIELD_LIMITS.message
    ) {
      return res.status(400).json({ error: "Please enter a message." });
    }

    const doc = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
    });

    return res.status(201).json({
      message: "Message received.",
      id: doc._id,
    });
  } catch (err) {
    console.error("Contact submit failed:", err);
    return res.status(500).json({ error: "Could not send message. Try again." });
  }
});

export default router;
