import { Router } from "express";
import { Contact } from "../../models/Contact.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = Router();

router.use(requireAdmin);

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { message: { $regex: q, $options: "i" } },
      ];
    }

    const items = await Contact.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ items, total: items.length });
  } catch (err) {
    console.error("[admin/contacts]", err);
    return res.status(500).json({ error: "Could not load contact requests." });
  }
});

export default router;
