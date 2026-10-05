import "dotenv/config";
import mongoose from "mongoose";
import { Event } from "../models/Event.js";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { Organization } from "../models/Organization.js";

const programSlug = process.argv[2] || "ai-hack-x-mrdu-2026";
const organizationSlug = process.argv[3] || "trizen-ventures";

function isoDay(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

function dayLabel(date) {
  const part = (options) => new Date(date).toLocaleDateString("en-GB", { timeZone: "UTC", ...options });
  return `${part({ weekday: "long" })}, ${part({ day: "numeric" })} ${part({ month: "long" })}`;
}

function dateRangeLabel(start, end) {
  const year = new Date(end || start).getUTCFullYear();
  if (!end || isoDay(start) === isoDay(end)) return `${dayLabel(start)} ${year}`;
  return `${dayLabel(start)} – ${dayLabel(end)} ${year}`;
}

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const [program, organization] = await Promise.all([
    HackathonProgram.findOne({ slug: programSlug }),
    Organization.findOne({ slug: organizationSlug }).lean(),
  ]);
  if (!program) throw new Error(`Hackathon program "${programSlug}" not found.`);
  if (!organization) throw new Error(`Organization "${organizationSlug}" not found.`);
  if (!program.startDate) throw new Error("Hackathon program has no start date.");

  const event = await Event.findOneAndUpdate(
    { slug: program.slug },
    {
      $set: {
        kind: "hackathon",
        endDateISO: isoDay(program.endDate),
        organizationId: organization._id,
      },
      $setOnInsert: {
        slug: program.slug,
        title: program.name,
        dateISO: isoDay(program.startDate),
        dateLabel: dateRangeLabel(program.startDate, program.endDate),
        dateConfirmed: true,
        time: "24-hour hackathon",
        venue: "Malla Reddy (MR) Deemed to be University",
        area: "Maisammaguda, Dulapally",
        address:
          "Malla Reddy (MR) Deemed to be University, Maisammaguda, Dulapally, Secunderabad / Hyderabad, Telangana 500100",
        mapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Malla+Reddy+University+Maisammaguda+Hyderabad",
        mapsEmbedUrl:
          "https://www.google.com/maps?q=Malla+Reddy+University+Maisammaguda+Hyderabad&output=embed",
        city: "Hyderabad",
        format: "Offline",
        status: "open",
        blurb:
          program.description ||
          "24-hour national hackathon with 4 tracks, live problem statements and a ₹2,00,000 prize pool.",
        published: true,
        sortOrder: 0,
        payment: { enabled: false, amountInr: 0, currency: "INR", methods: [], tickets: [] },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!program.eventId) {
    program.eventId = event._id;
    await program.save();
  }

  console.log(
    JSON.stringify(
      {
        event: event.slug,
        organization: organization.slug,
        dateISO: event.dateISO,
        endDateISO: event.endDateISO,
        published: event.published,
        programLinked: String(program.eventId) === String(event._id),
      },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}
