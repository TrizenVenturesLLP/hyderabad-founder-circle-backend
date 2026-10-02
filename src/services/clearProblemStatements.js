import dotenv from "dotenv";
import mongoose from "mongoose";
import { ProblemStatement } from "../models/ProblemStatement.js";

dotenv.config();

async function clearAllProblemStatements() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const countBefore = await ProblemStatement.countDocuments({});
    console.log(`Current Problem Statements in DB: ${countBefore}`);

    const result = await ProblemStatement.deleteMany({});
    console.log(`🎉 Deleted ${result.deletedCount} problem statement documents from MongoDB.`);

    const countAfter = await ProblemStatement.countDocuments({});
    console.log(`📊 Final Total Problem Statements in MongoDB: ${countAfter}`);
  } catch (err) {
    console.error("Error clearing problem statements:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

void clearAllProblemStatements();
