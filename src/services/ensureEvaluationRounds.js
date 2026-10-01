import { HackathonJuryEvaluation } from "../models/HackathonJuryEvaluation.js";

/**
 * Evaluations are unique per team + jury member + round. Older records predate
 * rounds: tag them as round 1 and drop the round-less unique index, which would
 * otherwise block a second-round score for the same team and jury member.
 */
export async function ensureEvaluationRounds() {
  const backfilled = await HackathonJuryEvaluation.updateMany(
    { round: { $exists: false } },
    { $set: { round: 1 } },
  );
  if (backfilled.modifiedCount > 0) {
    console.log(`[evaluation-rounds] Tagged ${backfilled.modifiedCount} evaluation(s) as round 1.`);
  }

  const collection = HackathonJuryEvaluation.collection;
  for (const index of await collection.indexes()) {
    const keys = Object.keys(index.key || {});
    const isRoundlessUnique =
      Boolean(index.unique) &&
      keys.length === 3 &&
      ["hackathonId", "teamId", "juryMemberId"].every((key) => keys.includes(key));
    if (isRoundlessUnique) {
      await collection.dropIndex(index.name);
      console.log(`[evaluation-rounds] Dropped round-less unique index "${index.name}".`);
    }
  }

  await HackathonJuryEvaluation.syncIndexes();
}
