import bcrypt from "bcryptjs";
import { Admin } from "../models/Admin.js";
import { Event } from "../models/Event.js";

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

export async function seedAdminAndEvents() {
  const email = (process.env.ADMIN_EMAIL || "admin@trizenventures.com")
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin123!";

  const existingAdmin = await Admin.findOne({ email });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(password, 12);
    await Admin.create({
      email,
      passwordHash,
      name: process.env.ADMIN_NAME || "Trizen Admin",
    });
    console.log(`[seed] Admin created: ${email}`);
  }

  for (const event of SEED_EVENTS) {
    const exists = await Event.findOne({ slug: event.slug });
    if (!exists) {
      await Event.create(event);
      console.log(`[seed] Event created: ${event.slug}`);
    } else if (event.slug === "hyderabad-founders-network-july") {
      await Event.updateOne(
        { slug: event.slug },
        { $set: { speakers: event.speakers, dateConfirmed: true } },
      );
      console.log(`[seed] Updated speakers for: ${event.slug}`);
    } else {
      await Event.updateOne(
        { slug: event.slug },
        { $set: { dateConfirmed: event.dateConfirmed === true } },
      );
      console.log(`[seed] Date confirmation for ${event.slug}: ${event.dateConfirmed === true}`);
    }
    if (event.slug === "hyderabad-founders-network-september") {
      const { slug, sortOrder, published, ...septemberFields } = event;
      await Event.updateOne(
        { slug: event.slug },
        { $set: { ...septemberFields, speakers: event.speakers } },
      );
      console.log(`[seed] Updated September meetup: ${event.slug}`);
    }
  }

  const augustUnpublish = await Event.updateOne(
    { slug: "hyderabad-founders-network-august" },
    { $set: { published: false } },
  );
  if (augustUnpublish.matchedCount > 0) {
    console.log("[seed] Unpublished August meetup (removed from public listings)");
  }
}
