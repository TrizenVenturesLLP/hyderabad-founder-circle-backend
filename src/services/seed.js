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

const SEED_EVENTS = [
  {
    slug: "hyderabad-founders-network-july",
    title: "Hyderabad Founders Network – July",
    dateISO: "2026-07-18",
    dateLabel: "Saturday, 18 July 2026",
    ...venueDefaults,
    status: "open",
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
    slug: "hyderabad-founders-network-august",
    title: "Hyderabad Founders Network – August Community Meetup",
    dateISO: "2026-08-18",
    dateLabel: "Saturday, 18 August 2026",
    ...venueDefaults,
    status: "open",
    blurb:
      "Connect with founders, builders, startup operators, mentors and aspiring entrepreneurs for meaningful conversations and long-term relationships.",
    sortOrder: 1,
    published: true,
    speakers: [],
  },
  {
    slug: "hyderabad-founders-network-september",
    title: "Hyderabad Founders Network – September Community Meetup",
    dateISO: "2026-09-19",
    dateLabel: "Saturday, 19 September 2026",
    ...venueDefaults,
    status: "coming-soon",
    blurb: "Themed session: going from first 10 to first 100 customers.",
    sortOrder: 2,
    published: true,
    speakers: [],
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
        { $set: { speakers: event.speakers } },
      );
      console.log(`[seed] Updated speakers for: ${event.slug}`);
    }
  }
}
