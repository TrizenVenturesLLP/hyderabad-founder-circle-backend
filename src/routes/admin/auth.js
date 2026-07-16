import { Router } from "express";
import bcrypt from "bcryptjs";
import { Admin } from "../../models/Admin.js";
import { requireAdmin, signAdminToken } from "../../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signAdminToken(admin);
    return res.json({
      token,
      admin: { id: admin._id, email: admin.email, name: admin.name },
    });
  } catch (err) {
    console.error("[admin/login]", err);
    return res.status(500).json({ error: "Login failed." });
  }
});

router.get("/me", requireAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("email name");
    if (!admin) {
      return res.status(401).json({ error: "Admin not found." });
    }
    return res.json({
      admin: { id: admin._id, email: admin.email, name: admin.name },
    });
  } catch (err) {
    console.error("[admin/me]", err);
    return res.status(500).json({ error: "Could not load admin." });
  }
});

export default router;
