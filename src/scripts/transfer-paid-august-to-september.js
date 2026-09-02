
import "dotenv/config";
import mongoose from "mongoose";
import { Event } from "../models/Event.js";
import { Rsvp } from "../models/Rsvp.js";

const FROM_SLUG = "hyderabad-founders-network-august";
const TO_SLUG = "hyderabad-founders-network-september";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is missing. Set it in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const september = await Event.findOne({ slug: TO_SLUG }).lean();
  if (!september) {
    console.error(`Target event not found: ${TO_SLUG}`);
    process.exit(1);
  }

  const eventSnapshot = {
    slug: september.slug,
    title: september.title,
    dateISO: september.dateISO,
    dateLabel: september.dateLabel,
    time: september.time,
    venue: september.venue,
    city: september.city,
    format: september.format,
  };

  const paidAugust = await Rsvp.find({
    "event.slug": FROM_SLUG,
    "payment.status": "paid",
  });

  console.log(`[transfer] Found ${paidAugust.length} paid RSVP(s) on ${FROM_SLUG}`);

  let moved = 0;
  let skipped = 0;

  for (const rsvp of paidAugust) {
    const conflict = await Rsvp.findOne({
      email: rsvp.email,
      "event.slug": TO_SLUG,
    }).lean();

    if (conflict) {
      console.log(`[transfer] Skip ${rsvp.email} — already on ${TO_SLUG}`);
      skipped += 1;
      continue;
    }

    rsvp.event = eventSnapshot;
    await rsvp.save();
    console.log(`[transfer] Moved ${rsvp.email} (${rsvp.name}) → ${TO_SLUG}`);
    moved += 1;
  }

  console.log(`[transfer] Done. moved=${moved} skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
