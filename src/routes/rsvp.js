import { Router } from "express";

const router = Router();

/**
 * Public RSVP creation is disabled — seats are reserved only after
 * successful Razorpay payment via POST /api/payments/verify.
 */
router.post("/", async (_req, res) => {
  return res.status(400).json({
    error:
      "Registration requires a ₹99 payment. Please complete checkout to reserve your seat.",
  });
});

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

export default router;
