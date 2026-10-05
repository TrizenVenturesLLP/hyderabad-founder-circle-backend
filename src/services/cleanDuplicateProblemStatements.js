import dotenv from "dotenv";
import mongoose from "mongoose";
import { ProblemStatement } from "../models/ProblemStatement.js";

dotenv.config();

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

async function cleanDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const statements = await ProblemStatement.find({}).sort({ createdAt: 1 }).lean();
    console.log(`Analyzing ${statements.length} problem statements for deduplication...`);

    const seenMap = new Map();
    const idsToDelete = [];

    for (const item of statements) {
      const key = normalize(item.title) || normalize(item.slug || item.id);

      if (seenMap.has(key)) {
        // Duplicate found -> mark for deletion
        idsToDelete.push(item._id);
      } else {
        // First occurrence -> keep
        seenMap.set(key, item._id);
      }
    }

    console.log(`Found ${idsToDelete.length} redundant duplicate documents to delete.`);
    console.log(`Keeping ${seenMap.size} unique problem statements.`);

    if (idsToDelete.length > 0) {
      const deleteResult = await ProblemStatement.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`🎉 Successfully deleted ${deleteResult.deletedCount} duplicate documents.`);
    }

    const remainingCount = await ProblemStatement.countDocuments({});
    console.log(`📊 Final Total Problem Statements in MongoDB: ${remainingCount}`);
  } catch (err) {
    console.error("Error cleaning duplicates:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

void cleanDuplicates();
