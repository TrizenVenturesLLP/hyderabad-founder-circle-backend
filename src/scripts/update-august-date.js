/**
 * Move the August meetup (and denormalized RSVP event snapshots) to 22 Aug 2026.
 *
 * Usage (from backend/):
 *   node src/scripts/update-august-date.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Event } from "../models/Event.js";
import { Rsvp } from "../models/Rsvp.js";

const SLUG = "hyderabad-founders-network-august";
const NEW_DATE_ISO = "2026-08-22";
const NEW_DATE_LABEL = "Saturday, 22 August 2026";
/** Prior dates that should be rewritten if still present on RSVPs. */
const OLD_DATE_ISOS = ["2026-08-15", "2026-08-18"];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is missing. Set it in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("[migrate] Connected");

  const eventResult = await Event.updateOne(
    { slug: SLUG },
    { $set: { dateISO: NEW_DATE_ISO, dateLabel: NEW_DATE_LABEL } },
  );
  console.log(
    `[migrate] Event "${SLUG}": matched=${eventResult.matchedCount}, modified=${eventResult.modifiedCount}`,
  );

  const rsvpFilter = {
    "event.slug": SLUG,
    $or: [
      { "event.dateISO": { $in: OLD_DATE_ISOS } },
      { "event.dateISO": { $ne: NEW_DATE_ISO } },
      { "event.dateLabel": { $ne: NEW_DATE_LABEL } },
    ],
  };

  const before = await Rsvp.countDocuments({ "event.slug": SLUG });
  const rsvpResult = await Rsvp.updateMany(rsvpFilter, {
    $set: {
      "event.dateISO": NEW_DATE_ISO,
      "event.dateLabel": NEW_DATE_LABEL,
    },
  });

  console.log(
    `[migrate] RSVPs for "${SLUG}": total=${before}, matched=${rsvpResult.matchedCount}, modified=${rsvpResult.modifiedCount}`,
  );
  console.log(
    `[migrate] New date: ${NEW_DATE_LABEL} (${NEW_DATE_ISO})`,
  );
}

main()
  .catch((err) => {
    console.error("[migrate] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
