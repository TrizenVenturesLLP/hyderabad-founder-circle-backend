/** Sanitize and normalize event payment config from admin payloads. */

const METHOD_TYPES = new Set([
  "razorpay",
  "upi_qr",
  "upi_id",
  "payment_link",
  "qiyu",
  "other",
]);

function sanitizeTickets(rawTickets) {
  if (!Array.isArray(rawTickets)) return [];
  return rawTickets
    .map((ticket) => {
      const id = String(ticket?.id || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
      const amountInr = Number(ticket?.amountInr);
      const memberCount = Number(ticket?.memberCount);
      if (!id || !Number.isFinite(amountInr) || amountInr <= 0) return null;
      return {
        id,
        label: String(ticket?.label || "").trim() || id,
        amountInr,
        memberCount:
          Number.isFinite(memberCount) && memberCount > 0
            ? Math.round(memberCount)
            : 1,
      };
    })
    .filter(Boolean);
}

export function sanitizePaymentConfig(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      enabled: true,
      amountInr: 99,
      currency: "INR",
      methods: [],
      tickets: [],
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

  const tickets = sanitizeTickets(raw.tickets);
  const amountInr = Number(raw.amountInr);
  const defaultAmount =
    tickets[0]?.amountInr ||
    (Number.isFinite(amountInr) && amountInr >= 0 ? amountInr : 99);

  return {
    enabled: raw.enabled !== false,
    amountInr: defaultAmount,
    currency: String(raw.currency || "INR").trim() || "INR",
    methods,
    tickets,
  };
}

export function resolvePaymentTicket(payment, ticketId) {
  const tickets = Array.isArray(payment?.tickets) ? payment.tickets : [];
  if (tickets.length === 0) {
    return {
      id: "",
      label: "Event Pass",
      amountInr: Number(payment?.amountInr) || 0,
      memberCount: 1,
    };
  }
  const id = String(ticketId || "").trim().toLowerCase();
  const ticket = tickets.find((item) => item.id === id);
  return ticket || null;
}

/** Public-safe payment config (no secrets). */
export function publicPaymentConfig(payment, fallbackAmountInr = 99) {
  const tickets = sanitizeTickets(payment?.tickets);
  const amountInr =
    Number(payment?.amountInr) > 0
      ? Number(payment.amountInr)
      : tickets[0]?.amountInr || fallbackAmountInr;
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
    tickets,
    formMode: tickets.length > 0 ? "minimal" : "full",
    hasRazorpay,
    hasManualMethods: manualMethods.length > 0,
    checkoutMode: hasRazorpay
      ? "razorpay"
      : manualMethods.length > 0
        ? "manual"
        : "razorpay",
  };
}
