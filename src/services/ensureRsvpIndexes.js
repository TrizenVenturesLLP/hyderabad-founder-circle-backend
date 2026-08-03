import { Rsvp } from "../models/Rsvp.js";

/**
 * Uniqueness is per email + event slug (same person can RSVP to July and August).
 * Drop any leftover email-only unique index from older schemas.
 */
export async function ensureRsvpIndexes() {
  const collection = Rsvp.collection;
  const indexes = await collection.indexes();

  for (const index of indexes) {
    if (index.name === "_id_") continue;

    const keys = Object.keys(index.key || {});
    const isEmailOnlyUnique =
      Boolean(index.unique) &&
      keys.length === 1 &&
      keys[0] === "email";

    if (isEmailOnlyUnique) {
      await collection.dropIndex(index.name);
      console.log(
        `[rsvp-indexes] Dropped global email unique index "${index.name}" (registration is per-event).`,
      );
    }
  }

  await Rsvp.syncIndexes();
  console.log(
    "[rsvp-indexes] Ensured unique index on email + event.slug (per-event registration).",
  );
}
