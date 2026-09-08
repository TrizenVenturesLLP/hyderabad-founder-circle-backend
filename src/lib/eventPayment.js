/** Sanitize and normalize event payment config from admin payloads. */

const METHOD_TYPES = new Set([
  "razorpay",
  "upi_qr",
  "upi_id",
  "payment_link",
  "qiyu",
  "other",
]);

export function sanitizePaymentConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      enabled: true,
      amountInr: 99,
      currency: "INR",
      methods: [],
    };
  }

  const methods = Array.isArray(raw.methods)
    ? raw.methods
        .map((m) => {
          const type = String(m?.type || "").trim();
          if (!METHOD_TYPES.has(type)) return null;
          return {
            type,
            enabled: m.enabled !== false,
            label: String(m.label || "").trim(),
            upiId: String(m.upiId || "").trim(),
            paymentNumber: String(m.paymentNumber || "").trim(),
            paymentLink: String(m.paymentLink || "").trim(),
            qrImageUrl: String(m.qrImageUrl || "").trim(),
            razorpayKeyId: String(m.razorpayKeyId || "").trim(),
            qiyuMerchantId: String(m.qiyuMerchantId || "").trim(),
            qiyuApiKey: String(m.qiyuApiKey || "").trim(),
            instructions: String(m.instructions || "").trim(),
          };
        })
        .filter(Boolean)
    : [];

  const amountInr = Number(raw.amountInr);
  return {
    enabled: raw.enabled !== false,
    amountInr: Number.isFinite(amountInr) && amountInr >= 0 ? amountInr : 99,
    currency: String(raw.currency || "INR").trim() || "INR",
    methods,
  };
}

/** Public-safe payment config (no secrets). */
export function publicPaymentConfig(payment, fallbackAmountInr = 99) {
  const amountInr =
    Number(payment?.amountInr) > 0
      ? Number(payment.amountInr)
      : fallbackAmountInr;
  const methods = Array.isArray(payment?.methods)
    ? payment.methods
        .filter((m) => m && m.enabled !== false)
        .map((m) => ({
          type: m.type,
          label: m.label || "",
          upiId: m.upiId || "",
          paymentNumber: m.paymentNumber || "",
          paymentLink: m.paymentLink || "",
          qrImageUrl: m.qrImageUrl || "",
          razorpayKeyId: m.type === "razorpay" ? m.razorpayKeyId || "" : "",
          qiyuMerchantId: m.qiyuMerchantId || "",
          instructions: m.instructions || "",
        }))
    : [];

  const hasRazorpay = methods.some((m) => m.type === "razorpay");
  const manualMethods = methods.filter((m) => m.type !== "razorpay");

  return {
    enabled: payment?.enabled !== false,
    amountInr,
    amountPaise: Math.round(amountInr * 100),
    currency: payment?.currency || "INR",
    methods,
    hasRazorpay,
    hasManualMethods: manualMethods.length > 0,
    checkoutMode: hasRazorpay
      ? "razorpay"
      : manualMethods.length > 0
        ? "manual"
        : "razorpay",
  };
}
