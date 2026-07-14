import { Router } from "express";
import { Rsvp } from "../models/Rsvp.js";
import { sendRsvpConfirmationEmail } from "../services/emailNotification.js";

const router = Router();

const ROLES = new Set([
  "Founder / Co-founder",
  "SDE",
  "AI Engineer",
  "AI Intern",
  "Product Manager",
  "Designer",
  "Operator / Growth",
  "Investor / Ecosystem",
  "Working professional",
  "Student",
  "Aspiring entrepreneur",
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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function trimStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

router.post("/", async (req, res) => {
  try {
    const body = req.body ?? {};
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
    } = body;

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
      return res.status(400).json({
        error:
          "Name, email, phone, LinkedIn, role, startup/company, startup stage, and industry are required.",
      });
    }

    const linkedinUrl = trimStr(linkedin);
    if (linkedinUrl.length > FIELD_LIMITS.linkedin) {
      return res.status(400).json({ error: "LinkedIn URL is too long." });
    }
    if (
      !/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(linkedinUrl) &&
      !/^linkedin\.com\/.+/i.test(linkedinUrl)
    ) {
      return res.status(400).json({ error: "Please provide a valid LinkedIn URL." });
    }

    const localPhoneDigits = trimStr(phone).replace(/\D/g, "");
    if (!/^\d{10}$/.test(localPhoneDigits)) {
      return res.status(400).json({ error: "Please provide a valid 10-digit mobile number." });
    }

    if (trimStr(name).length > FIELD_LIMITS.name) {
      return res.status(400).json({ error: "Name is too long." });
    }
    if (trimStr(email).length > FIELD_LIMITS.email) {
      return res.status(400).json({ error: "Email is too long." });
    }
    if (trimStr(company).length > FIELD_LIMITS.company) {
      return res.status(400).json({ error: "Company name is too long." });
    }
    if (trimStr(canHelpWith).length > FIELD_LIMITS.canHelpWith) {
      return res.status(400).json({ error: "Help-others answer is too long." });
    }
    if (trimStr(biggestChallenge).length > FIELD_LIMITS.biggestChallenge) {
      return res.status(400).json({ error: "Biggest challenge answer is too long." });
    }
    if (trimStr(questions).length > FIELD_LIMITS.questions) {
      return res.status(400).json({ error: "Questions answer is too long." });
    }

    if (!ROLES.has(role.trim())) {
      return res.status(400).json({ error: "Please select a valid role." });
    }

    if (!STARTUP_STAGES.has(startupStage.trim())) {
      return res.status(400).json({ error: "Please select a valid startup stage." });
    }

    const gtmList = Array.isArray(gtmChallenges)
      ? gtmChallenges.map((item) => trimStr(item)).filter(Boolean)
      : [];

    if (gtmList.length !== 3) {
      return res.status(400).json({
        error: "Please select exactly 3 go-to-market challenges.",
      });
    }

    if (gtmList.some((item) => !GTM_CHALLENGES.has(item))) {
      return res.status(400).json({ error: "Please select valid GTM challenge options." });
    }

    const leaveWithList = Array.isArray(leaveWith)
      ? leaveWith.map((item) => trimStr(item)).filter(Boolean)
      : [];

    if (leaveWithList.length === 0) {
      return res.status(400).json({
        error: "Please select at least one option for what you hope to leave with.",
      });
    }

    if (leaveWithList.some((item) => !LEAVE_WITH.has(item))) {
      return res.status(400).json({ error: "Please select valid leave-with options." });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({ error: "Please provide a valid email." });
    }

    const lookingForList = Array.isArray(lookingFor)
      ? lookingFor.map((item) => trimStr(item)).filter(Boolean)
      : [];

    if (lookingForList.length === 0) {
      return res
        .status(400)
        .json({ error: "Please select at least one option for what you are looking for." });
    }

    if (lookingForList.some((item) => !LOOKING_FOR.has(item))) {
      return res.status(400).json({ error: "Please select valid looking-for options." });
    }

    const offerCommunityList = Array.isArray(offerCommunity)
      ? offerCommunity.map((item) => trimStr(item)).filter(Boolean)
      : [];

    if (offerCommunityList.length === 0) {
      return res.status(400).json({
        error: "Please select at least one option for what you can offer the community.",
      });
    }

    if (offerCommunityList.some((item) => !OFFER_COMMUNITY.has(item))) {
      return res
        .status(400)
        .json({ error: "Please select valid offer-community options." });
    }

    const wantToMeetList = Array.isArray(wantToMeet)
      ? wantToMeet.map((item) => trimStr(item)).filter(Boolean)
      : [];

    if (wantToMeetList.length === 0) {
      return res.status(400).json({
        error: "Please select at least one option for who you would like to meet.",
      });
    }

    if (wantToMeetList.some((item) => !WANT_TO_MEET.has(item))) {
      return res.status(400).json({ error: "Please select valid want-to-meet options." });
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
      return res.status(400).json({ error: "Complete event details are required." });
    }

    const code = trimStr(countryCode) || "+91";

    const rsvp = await Rsvp.create({
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
    });

    // Non-blocking confirmation email
    void sendRsvpConfirmationEmail({
      rsvp,
      mapsUrl: typeof event.mapsUrl === "string" ? event.mapsUrl : "",
    });

    return res.status(201).json({
      message: "RSVP submitted successfully.",
      id: rsvp._id,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        error: "You have already registered for this event with this email.",
      });
    }
    console.error("RSVP create failed:", err);
    return res.status(500).json({ error: "Could not save RSVP. Please try again." });
  }
});

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

export default router;
