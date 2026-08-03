import { Router } from "express";
import { Rsvp } from "../models/Rsvp.js";
import {
  sendRsvpConfirmationEmail,
  sendInvoiceEmailNotification,
} from "../services/emailNotification.js";
import {
  getRazorpayClient,
  REGISTRATION_FEE_INR,
  REGISTRATION_FEE_PAISE,
  verifyPaymentSignature,
} from "../lib/razorpay.js";

const router = Router();

const ROLES = new Set([
  "Founder / Co-founder",
  "Aspiring entrepreneur",
  "Product Manager",
  "Designer",
  "Operator / Growth",
  "Investor / Ecosystem",
  "Working professional",
  "Student",
  "Other",
]);

const STARTUP_STAGES = new Set([
  "Idea stage",
  "MVP in development",
  "MVP launched",
  "Acquiring first customers",
  "Early revenue",
  "Scaling GTM",
  "Exploring a startup idea",
]);

const GTM_CHALLENGES = new Set([
  "Defining our Ideal Customer Profile (ICP)",
  "Positioning our product clearly in the market",
  "Validating product-market fit",
  "Finding our first paying customers",
  "Building a repeatable customer acquisition strategy",
  "Generating demand with a limited budget",
  "Pricing and packaging our product",
  "Scaling beyond founder-led sales",
  "Building an effective sales pipeline",
  "Choosing the right GTM strategy for our stage",
  "Preparing for launch",
  "Other",
]);

const LEAVE_WITH = new Set([
  "A clearer GTM strategy",
  "Better positioning",
  "Customer acquisition ideas",
  "Feedback on my current approach",
  "Founder connections",
  "Practical frameworks",
  "Other",
]);

const LOOKING_FOR = new Set([
  "Networking",
  "Mentors",
  "Investors",
  "Customers",
  "Hiring",
  "Collaboration",
  "Learning",
]);

const OFFER_COMMUNITY = new Set([
  "Mentorship",
  "Technical / engineering skills",
  "AI / ML expertise",
  "Product / design",
  "GTM / growth",
  "Hiring intros",
  "Investor intros",
  "Domain expertise",
  "Feedback / sounding board",
  "Other",
]);

const WANT_TO_MEET = new Set([
  "Founders",
  "AI builders",
  "Investors",
  "Designers",
  "Operators / growth",
  "Potential co-founders",
  "Engineers",
  "Product managers",
  "Mentors",
  "Other",
]);

const FIELD_LIMITS = {
  name: 80,
  email: 120,
  phone: 10,
  linkedin: 200,
  company: 100,
  canHelpWith: 400,
  biggestChallenge: 400,
  questions: 400,
};

const PAYMENT_METHODS = new Set(["upi", "card", "netbanking", "wallet"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function trimStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateRegistrationBody(body) {
  const {
    name,
    email,
    phone,
    countryCode = "+91",
    linkedin = "",
    role,
    company,
    startupStage = "",
    gtmChallenges = [],
    leaveWith = [],
    industry,
    lookingFor = [],
    offerCommunity = [],
    wantToMeet = [],
    canHelpWith = "",
    biggestChallenge = "",
    joinWhatsapp = false,
    subscribeUpdates = false,
    questions = "",
    event,
  } = body ?? {};

  if (
    !isNonEmptyString(name) ||
    !isNonEmptyString(email) ||
    !isNonEmptyString(phone) ||
    !isNonEmptyString(linkedin) ||
    !isNonEmptyString(role) ||
    !isNonEmptyString(company) ||
    !isNonEmptyString(startupStage) ||
    !isNonEmptyString(industry)
  ) {
    return {
      error:
        "Name, email, phone, LinkedIn, role, startup/company, startup stage, and industry are required.",
    };
  }

  const linkedinUrl = trimStr(linkedin);
  if (linkedinUrl.length > FIELD_LIMITS.linkedin) {
    return { error: "LinkedIn URL is too long." };
  }
  if (
    !/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(linkedinUrl) &&
    !/^linkedin\.com\/.+/i.test(linkedinUrl)
  ) {
    return { error: "Please provide a valid LinkedIn URL." };
  }

  const localPhoneDigits = trimStr(phone).replace(/\D/g, "");
  if (!/^\d{10}$/.test(localPhoneDigits)) {
    return { error: "Please provide a valid 10-digit mobile number." };
  }

  if (trimStr(name).length > FIELD_LIMITS.name) {
    return { error: "Name is too long." };
  }
  if (trimStr(email).length > FIELD_LIMITS.email) {
    return { error: "Email is too long." };
  }
  if (trimStr(company).length > FIELD_LIMITS.company) {
    return { error: "Company name is too long." };
  }
  if (trimStr(canHelpWith).length > FIELD_LIMITS.canHelpWith) {
    return { error: "Help-others answer is too long." };
  }
  if (trimStr(biggestChallenge).length > FIELD_LIMITS.biggestChallenge) {
    return { error: "Biggest challenge answer is too long." };
  }
  if (trimStr(questions).length > FIELD_LIMITS.questions) {
    return { error: "Questions answer is too long." };
  }

  if (!ROLES.has(role.trim())) {
    return { error: "Please select a valid role." };
  }

  if (!STARTUP_STAGES.has(startupStage.trim())) {
    return { error: "Please select a valid startup stage." };
  }

  const gtmList = Array.isArray(gtmChallenges)
    ? gtmChallenges.map((item) => trimStr(item)).filter(Boolean)
    : [];

  if (gtmList.length !== 3) {
    return { error: "Please select exactly 3 go-to-market challenges." };
  }

  if (gtmList.some((item) => !GTM_CHALLENGES.has(item))) {
    return { error: "Please select valid GTM challenge options." };
  }

  const leaveWithList = Array.isArray(leaveWith)
    ? leaveWith.map((item) => trimStr(item)).filter(Boolean)
    : [];

  if (leaveWithList.length === 0) {
    return {
      error: "Please select at least one option for what you hope to leave with.",
    };
  }

  if (leaveWithList.some((item) => !LEAVE_WITH.has(item))) {
    return { error: "Please select valid leave-with options." };
  }

  if (!isValidEmail(email.trim())) {
    return { error: "Please provide a valid email." };
  }

  const lookingForList = Array.isArray(lookingFor)
    ? lookingFor.map((item) => trimStr(item)).filter(Boolean)
    : [];

  if (lookingForList.length === 0) {
    return {
      error: "Please select at least one option for what you are looking for.",
    };
  }

  if (lookingForList.some((item) => !LOOKING_FOR.has(item))) {
    return { error: "Please select valid looking-for options." };
  }

  const offerCommunityList = Array.isArray(offerCommunity)
    ? offerCommunity.map((item) => trimStr(item)).filter(Boolean)
    : [];

  if (offerCommunityList.length === 0) {
    return {
      error: "Please select at least one option for what you can offer the community.",
    };
  }

  if (offerCommunityList.some((item) => !OFFER_COMMUNITY.has(item))) {
    return { error: "Please select valid offer-community options." };
  }

  const wantToMeetList = Array.isArray(wantToMeet)
    ? wantToMeet.map((item) => trimStr(item)).filter(Boolean)
    : [];

  if (wantToMeetList.length === 0) {
    return {
      error: "Please select at least one option for who you would like to meet.",
    };
  }

  if (wantToMeetList.some((item) => !WANT_TO_MEET.has(item))) {
    return { error: "Please select valid want-to-meet options." };
  }

  if (
    !event ||
    !isNonEmptyString(event.slug) ||
    !isNonEmptyString(event.title) ||
    !isNonEmptyString(event.dateISO) ||
    !isNonEmptyString(event.dateLabel) ||
    !isNonEmptyString(event.time) ||
    !isNonEmptyString(event.venue) ||
    !isNonEmptyString(event.city) ||
    !isNonEmptyString(event.format)
  ) {
    return { error: "Complete event details are required." };
  }

  const code = trimStr(countryCode) || "+91";

  return {
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: `${code} ${localPhoneDigits}`.trim(),
      countryCode: code,
      linkedin: linkedinUrl,
      role: role.trim(),
      company: company.trim(),
      startupStage: trimStr(startupStage),
      gtmChallenges: gtmList,
      leaveWith: leaveWithList,
      industry: industry.trim(),
      lookingFor: lookingForList,
      offerCommunity: offerCommunityList,
      wantToMeet: wantToMeetList,
      canHelpWith: trimStr(canHelpWith),
      biggestChallenge: trimStr(biggestChallenge),
      joinWhatsapp: Boolean(joinWhatsapp),
      subscribeUpdates: Boolean(subscribeUpdates),
      questions: trimStr(questions),
      event: {
        slug: event.slug.trim(),
        title: event.title.trim(),
        dateISO: event.dateISO.trim(),
        dateLabel: event.dateLabel.trim(),
        time: event.time.trim(),
        venue: event.venue.trim(),
        city: event.city.trim(),
        format: event.format.trim(),
      },
      mapsUrl: typeof event.mapsUrl === "string" ? event.mapsUrl : "",
      localPhoneDigits,
    },
  };
}

router.get("/config", (_req, res) => {
  try {
    const { keyId } = getRazorpayClient();
    return res.json({
      keyId,
      amountInr: REGISTRATION_FEE_INR,
      amountPaise: REGISTRATION_FEE_PAISE,
      currency: "INR",
      ticketName: "Event Pass",
    });
  } catch (err) {
    console.error("Payment config failed:", err);
    return res.status(503).json({
      error: "Payment is temporarily unavailable. Please try again later.",
    });
  }
});

router.post("/create-order", async (req, res) => {
  try {
    const validated = validateRegistrationBody(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const { data } = validated;
    const method = trimStr(req.body?.paymentMethod).toLowerCase();
    if (!PAYMENT_METHODS.has(method)) {
      return res.status(400).json({ error: "Please select a valid payment method." });
    }

    const existing = await Rsvp.findOne({
      email: data.email,
      "event.slug": data.event.slug,
    }).lean();

    if (existing) {
      return res.status(409).json({
        error:
          "You're already registered for this event with this email. You can still register for other meetups.",
      });
    }

    const { keyId, client } = getRazorpayClient();
    const receipt = `hfn_${Date.now().toString(36)}`.slice(0, 40);

    const order = await client.orders.create({
      amount: REGISTRATION_FEE_PAISE,
      currency: "INR",
      receipt,
      notes: {
        eventSlug: data.event.slug,
        email: data.email,
        name: data.name,
        method,
      },
    });

    return res.status(201).json({
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      amountInr: REGISTRATION_FEE_INR,
      ticketName: "Event Pass",
      prefill: {
        name: data.name,
        email: data.email,
        contact: data.localPhoneDigits,
      },
    });
  } catch (err) {
    console.error("Create order failed:", err);
    const message =
      err instanceof Error && /not configured/i.test(err.message)
        ? "Payment is not configured yet. Please contact the organizers."
        : "Could not start payment. Please try again.";
    return res.status(500).json({ error: message });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      paymentMethod = "",
    } = req.body ?? {};

    if (
      !isNonEmptyString(orderId) ||
      !isNonEmptyString(paymentId) ||
      !isNonEmptyString(signature)
    ) {
      return res.status(400).json({ error: "Missing payment verification details." });
    }

    if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ error: "Payment verification failed." });
    }

    const validated = validateRegistrationBody(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const { data } = validated;
    const method = trimStr(paymentMethod).toLowerCase();

    const rsvp = await Rsvp.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      countryCode: data.countryCode,
      linkedin: data.linkedin,
      role: data.role,
      company: data.company,
      startupStage: data.startupStage,
      gtmChallenges: data.gtmChallenges,
      leaveWith: data.leaveWith,
      industry: data.industry,
      lookingFor: data.lookingFor,
      offerCommunity: data.offerCommunity,
      wantToMeet: data.wantToMeet,
      canHelpWith: data.canHelpWith,
      biggestChallenge: data.biggestChallenge,
      joinWhatsapp: data.joinWhatsapp,
      subscribeUpdates: data.subscribeUpdates,
      questions: data.questions,
      event: data.event,
      payment: {
        status: "paid",
        amountInr: REGISTRATION_FEE_INR,
        amountPaise: REGISTRATION_FEE_PAISE,
        currency: "INR",
        method: PAYMENT_METHODS.has(method) ? method : "",
        razorpayOrderId: trimStr(orderId),
        razorpayPaymentId: trimStr(paymentId),
        razorpaySignature: trimStr(signature),
        paidAt: new Date(),
      },
    });

    void sendRsvpConfirmationEmail({
      rsvp,
      mapsUrl: data.mapsUrl,
    });

    void sendInvoiceEmailNotification({ rsvp });

    return res.status(201).json({
      message: "Payment successful. RSVP submitted.",
      id: rsvp._id,
      paymentId: trimStr(paymentId),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        error:
          "You're already registered for this event with this email. You can still register for other meetups.",
      });
    }
    console.error("Payment verify failed:", err);
    return res.status(500).json({
      error: "Could not complete registration after payment. Please contact support.",
    });
  }
});

export default router;
