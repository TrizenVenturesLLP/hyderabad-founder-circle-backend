import mongoose from "mongoose";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { Event } from "../models/Event.js";

const EMPTY_CONTEXT = Object.freeze({
  name: "",
  slug: "",
  startDate: null,
  endDate: null,
  dateLabel: "",
  venueName: "",
  city: "",
});

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Program dates are stored as UTC calendar-day boundaries (e.g. 00:00Z to
// 23:59Z), so they must be formatted in UTC to show the intended days.
function dayParts(date) {
  return {
    day: date.getUTCDate(),
    month: date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
    year: date.getUTCFullYear(),
  };
}

export function formatHackathonDateRange(startValue, endValue) {
  const start = validDate(startValue);
  const end = validDate(endValue);
  if (!start && !end) return "";
  if (!start || !end) {
    const only = dayParts(start || end);
    return `${only.month} ${only.day}, ${only.year}`;
  }
  const a = dayParts(start);
  const b = dayParts(end);
  if (a.year === b.year && a.month === b.month) {
    return a.day === b.day ? `${a.month} ${a.day}, ${a.year}` : `${a.month} ${a.day}–${b.day}, ${a.year}`;
  }
  if (a.year === b.year) return `${a.month} ${a.day} – ${b.month} ${b.day}, ${a.year}`;
  return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`;
}

/**
 * Resolves the Hackathon details shown in emails from the program record.
 * Accepts a HackathonProgram document/object or its id. Venue comes only from
 * the linked Event, so it is left empty when the program has no event.
 */
export async function loadHackathonEmailContext(programOrId) {
  try {
    const isReference =
      typeof programOrId === "string" || programOrId instanceof mongoose.Types.ObjectId;
    const program = isReference
      ? await HackathonProgram.findById(programOrId).select("name slug startDate endDate eventId").lean()
      : programOrId;
    if (!program) return { ...EMPTY_CONTEXT };

    const event = program.eventId
      ? await Event.findById(program.eventId).select("venue city").lean()
      : null;

    return {
      name: String(program.name || "").trim(),
      slug: String(program.slug || "").trim(),
      startDate: validDate(program.startDate),
      endDate: validDate(program.endDate),
      dateLabel: formatHackathonDateRange(program.startDate, program.endDate),
      venueName: String(event?.venue || "").trim(),
      city: String(event?.city || "").trim(),
    };
  } catch (error) {
    console.warn(
      "[hackathon-email] Could not load Hackathon details:",
      error instanceof Error ? error.message : error,
    );
    return { ...EMPTY_CONTEXT };
  }
}
