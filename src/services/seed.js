import bcrypt from "bcryptjs";
import { Admin } from "../models/Admin.js";
import { Event } from "../models/Event.js";
import { Organization } from "../models/Organization.js";

const venueDefaults = {
  time: "11:00 AM – 1:00 PM",
  venue: "DraperU India",
  space: "5th floor event space",
  area: "Gachibowli",
  address:
    "DraperU India (Formerly Draper Startup House Hyderabad), Rajiv Gandhi Nagar, Gachibowli, Hyderabad, Telangana 500032",
  mapsUrl:
    "https://maps.app.goo.gl/KTRvgep4y9ciSCjSA?g_st=com.microsoft.skype.teams.extshare",
  mapsEmbedUrl:
    "https://www.google.com/maps?q=DraperU+India+Gachibowli+Hyderabad&output=embed",
  city: "Hyderabad",
  seats: 40,
  format: "Offline",
};

const nanoSpaceVenue = {
  time: "10:30 AM – 1:00 PM",
  venue: "NanoSpace Coworking",
  space: "Nanakramguda Branch",
  area: "Nanakramguda",
  address: "NanoSpace Coworking, Nanakramguda, Hyderabad, Telangana",
  mapsUrl: "https://share.google/sRNjvPbJCCaQRIYrB",
  mapsEmbedUrl:
    "https://www.google.com/maps?q=NanoSpace+Coworking+Nanakramguda+Branch+Hyderabad&output=embed",
  city: "Hyderabad",
  seats: 50,
  format: "Offline",
};

const bandExplorersVenue = {
  time: "6:00 PM – 9:00 PM",
  venue: "NanoSpace Coworking",
  space: "Vijaya Krishna Towers",
  area: "Nanakramguda",
  address:
    "Vijaya Krishna Towers, Nanakramguda, Hyderabad, Telangana",
  mapsUrl: "https://share.google/sRNjvPbJCCaQRIYrB",
  mapsEmbedUrl:
    "https://www.google.com/maps?q=Vijaya+Krishna+Towers+Nanakramguda+Hyderabad&output=embed",
  city: "Hyderabad",
  seats: 80,
  format: "Offline",
};

const DEFAULT_PAYMENT = {
  enabled: true,
  amountInr: 99,
  currency: "INR",
  methods: [
    {
      type: "razorpay",
      enabled: true,
      label: "Razorpay",
      razorpayKeyId: "",
      instructions: "",
    },
  ],
};

const BAND_EXPLORERS_PAYMENT = {
  enabled: true,
  amountInr: 599,
  currency: "INR",
  methods: [
    {
      type: "upi_qr",
      enabled: true,
      label: "Scan QR to pay",
      upiId: "",
      paymentNumber: "",
      qrImageUrl:
        "minio:event-qr/band-explorers-vybe/payment-qr.png",
      instructions:
        "Scan the QR code to pay ₹599. For queries call +91 8247579912. No snacks included.",
    },
  ],
};

const SEED_EVENTS = [
  {
    slug: "hyderabad-founders-network-july",
    title: "Hyderabad Founders Network – July",
    dateISO: "2026-07-18",
    dateLabel: "Saturday, 18 July 2026",
    dateConfirmed: true,
    ...venueDefaults,
    status: "completed",
    blurb:
      "The monthly roundtable. Show up, share what you're building, find your people.",
    sortOrder: 0,
    published: true,
    payment: DEFAULT_PAYMENT,
    speakers: [
      {
        name: "Prasad Anumula",
        role: "Founder & CEO, Risk Guard Enterprise Solutions",
        bio: "Driving enterprise resilience through risk management, governance, and innovation.",
        photo: "Prasad-Anumula",
        photoPosition: "center top",
        photoPaddingBottom: "22%",
        linkedin: "https://www.linkedin.com/in/prasad-anumula/",
      },
      {
        name: "Dr. Shripuja Siddamsetty",
        role: "Founder, Calm Mind Wellness & Barefoot Learning Experience",
        bio: "Empowering well-being, fostering growth, and building better workplaces.",
        photo: "Shripuja-Siddamsetty",
        linkedin:
          "https://www.linkedin.com/in/dr-shripuja-siddamsetty-m-phil-ph-d-scholar-973342a2",
      },
      {
        name: "Katla Charitavya",
        role: "Founder and Career Counselor, Yatrivese Edutours",
        bio: "Empowering founders to build, scale, and succeed globally.",
        photo: "Katla-Charitavya",
        photoPosition: "center 18%",
        photoPaddingBottom: "12%",
        website: "https://yatriverse.in/",
      },
    ],
  },
  {
    slug: "hyderabad-founders-network-september",
    title: "Hyderabad Founders Network – September",
    dateISO: "2026-09-05",
    dateLabel: "Saturday, 5 September 2026",
    dateConfirmed: true,
    ...nanoSpaceVenue,
    status: "open",
    blurb:
      "Building a stronger founder community in Hyderabad. Connect · Learn · Collaborate · Grow.",
    sortOrder: 0,
    published: true,
    payment: DEFAULT_PAYMENT,
    speakers: [
      {
        name: "Sree Keerthana Gorty",
        role: "Senior Business Analyst, Rockwell Automation",
        org: "Top 1% Topmate Mentor · Creator of KrunchyAITalks",
        badge: "Featured Speaker",
        bio: "12+ years in the software industry. Session: AI, Talent & the Future of Work — 30-minute talk + audience Q&A. Focus: AI · Careers · Technology · Mentoring.",
        photo: "Sree-Keerthana-Gorty",
        linkedin: "https://www.linkedin.com/in/sreekeerthanagorty/",
      },
      {
        name: "Raffi Shaik",
        role: "Founder & CEO, NanoSpace",
        org: "Lawyer · Author · Entrepreneur",
        badge: "Behind the Build",
        bio: "Lawyer, author and entrepreneur behind NanoSpace. Session: Behind the Build — Founder Story — 20-minute talk on the real founder journey. Focus: Coworking · Scaling · Challenges · Lessons.",
        photo: "Raffi-Shaik",
        linkedin: "https://www.linkedin.com/company/nanospace-coworking/",
        website: "https://nanospace.in/",
      },
    ],
  },
];

const NANOSPACE_SEED_EVENTS = [
  {
    slug: "band-explorers-vybe",
    title: "Band Explorers Vybe — The Corporate Music Break",
    dateISO: "2026-09-19",
    dateLabel: "Saturday, 19 September 2026",
    dateConfirmed: true,
    ...bandExplorersVenue,
    status: "open",
    blurb:
      "Live music · Unwind · Connect. Up to 10 members can pitch their problem statements (2 minutes each). Timings 6:00 PM – 9:00 PM at NanoSpace. No snacks. Marketing partner: Trizen Community. Entry ₹599.",
    sortOrder: 1,
    published: true,
    payment: BAND_EXPLORERS_PAYMENT,
    hosts: [
      {
        name: "Fun Fusion @Work",
        role: "Event partner",
        startup: "Corporate music & community experiences",
        linkedin: "",
        photo: "",
      },
      {
        name: "NanoSpace Coworking",
        role: "Host venue",
        startup: "Nanakramguda, Hyderabad",
        linkedin: "https://www.linkedin.com/company/nanospace-coworking/",
        photo: "",
      },
    ],
    speakers: [],
  },
];

async function upsertOrganization({ name, slug, type, status = "active" }) {
  const org = await Organization.findOneAndUpdate(
    { slug },
    { $set: { name, slug, type, status } },
    { upsert: true, new: true },
  );
  return org;
}

async function upsertStaffUser({
  email,
  password,
  name,
  role,
  organizationId,
}) {
  const normalized = email.trim().toLowerCase();
  let admin = await Admin.findOne({ email: normalized });
  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 12);
    admin = await Admin.create({
      email: normalized,
      passwordHash,
      name,
      role,
      organizationId: organizationId || null,
    });
    console.log(`[seed] Staff created: ${normalized} (${role})`);
    return admin;
  }

  admin.name = name;
  admin.role = role;
  admin.organizationId = organizationId || null;
  await admin.save();
  console.log(`[seed] Staff updated: ${normalized} (${role})`);
  return admin;
}

export async function seedAdminAndEvents() {
  const trizenOrg = await upsertOrganization({
    name: "Trizen Ventures",
    slug: "trizen-ventures",
    type: "partner",
    status: "active",
  });
  const adminOrg = await upsertOrganization({
    name: "Admin",
    slug: "admin",
    type: "platform",
    status: "active",
  });
  const nanoSpaceOrg = await upsertOrganization({
    name: "NanoSpace Coworking",
    slug: "nanospace",
    type: "partner",
    status: "active",
  });
  console.log(
    `[seed] Organizations ready: ${trizenOrg.slug}, ${adminOrg.slug}, ${nanoSpaceOrg.slug}`,
  );

  const platformAdmin = await upsertStaffUser({
    email: process.env.ADMIN_EMAIL || "admin@trizenventures.com",
    password: process.env.ADMIN_PASSWORD || "Admin123!",
    name: process.env.ADMIN_NAME || "Platform Admin",
    role: "platform_admin",
    organizationId: null,
  });

  await upsertStaffUser({
    email: process.env.TRIZEN_ORG_EMAIL || "trizen@trizenventures.com",
    password: process.env.TRIZEN_ORG_PASSWORD || "TrizenOrg123!",
    name: process.env.TRIZEN_ORG_NAME || "Trizen Ventures",
    role: "org_admin",
    organizationId: trizenOrg._id,
  });

  await upsertStaffUser({
    email: process.env.NANOSPACE_ORG_EMAIL || "nanospace@nanospace.in",
    password: process.env.NANOSPACE_ORG_PASSWORD || "NanoSpace123!",
    name: process.env.NANOSPACE_ORG_NAME || "NanoSpace Coworking",
    role: "org_admin",
    organizationId: nanoSpaceOrg._id,
  });

  const migrated = await Event.updateMany(
    {
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    },
    {
      $set: {
        organizationId: trizenOrg._id,
        createdBy: platformAdmin._id,
        payment: DEFAULT_PAYMENT,
      },
    },
  );
  if (migrated.modifiedCount > 0) {
    console.log(
      `[seed] Migrated ${migrated.modifiedCount} event(s) → Trizen Ventures`,
    );
  }

  for (const event of SEED_EVENTS) {
    const exists = await Event.findOne({ slug: event.slug });
    const withOwner = {
      ...event,
      organizationId: trizenOrg._id,
      createdBy: platformAdmin._id,
      payment: event.payment || DEFAULT_PAYMENT,
    };

    if (!exists) {
      await Event.create(withOwner);
      console.log(`[seed] Event created: ${event.slug}`);
    } else if (event.slug === "hyderabad-founders-network-july") {
      await Event.updateOne(
        { slug: event.slug },
        {
          $set: {
            speakers: event.speakers,
            dateConfirmed: true,
            organizationId: trizenOrg._id,
            payment: exists.payment?.methods?.length
              ? exists.payment
              : DEFAULT_PAYMENT,
          },
        },
      );
      console.log(`[seed] Updated speakers for: ${event.slug}`);
    } else {
      await Event.updateOne(
        { slug: event.slug },
        { $set: { dateConfirmed: event.dateConfirmed === true } },
      );
      console.log(
        `[seed] Date confirmation for ${event.slug}: ${event.dateConfirmed === true}`,
      );
    }
    if (event.slug === "hyderabad-founders-network-september") {
      const { slug, sortOrder, published, ...septemberFields } = event;
      await Event.updateOne(
        { slug: event.slug },
        {
          $set: {
            ...septemberFields,
            speakers: event.speakers,
            organizationId: trizenOrg._id,
            createdBy: platformAdmin._id,
            payment: exists?.payment?.methods?.length
              ? exists.payment
              : DEFAULT_PAYMENT,
          },
        },
      );
      console.log(`[seed] Updated September meetup: ${event.slug}`);
    }
  }

  for (const event of NANOSPACE_SEED_EVENTS) {
    const exists = await Event.findOne({ slug: event.slug });
    const withOwner = {
      ...event,
      organizationId: nanoSpaceOrg._id,
      createdBy: platformAdmin._id,
      payment: event.payment || BAND_EXPLORERS_PAYMENT,
    };

    if (!exists) {
      await Event.create(withOwner);
      console.log(`[seed] Event created: ${event.slug}`);
    } else {
      const { slug, sortOrder, published, ...fields } = event;
      await Event.updateOne(
        { slug: event.slug },
        {
          $set: {
            ...fields,
            organizationId: nanoSpaceOrg._id,
            createdBy: platformAdmin._id,
            payment: event.payment,
            published: event.published !== false,
            sortOrder: event.sortOrder ?? exists.sortOrder ?? 0,
          },
        },
      );
      console.log(`[seed] Updated NanoSpace event: ${event.slug}`);
    }
  }

  const augustUnpublish = await Event.updateOne(
    { slug: "hyderabad-founders-network-august" },
    {
      $set: {
        published: false,
        organizationId: trizenOrg._id,
      },
    },
  );
  if (augustUnpublish.matchedCount > 0) {
    console.log(
      "[seed] Unpublished August meetup (removed from public listings)",
    );
  }
}
