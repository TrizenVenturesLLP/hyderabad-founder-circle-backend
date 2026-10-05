import dotenv from "dotenv";
import mongoose from "mongoose";
import { ProblemStatement } from "../models/ProblemStatement.js";
import { HackathonProgram } from "../models/HackathonProgram.js";

dotenv.config();

async function getStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const total = await ProblemStatement.countDocuments({});
    const program = await HackathonProgram.findOne({ slug: "ai-hack-x-mrdu-2026" });
    const activeLinked = program
      ? await ProblemStatement.countDocuments({ hackathonId: program._id, status: "active" })
      : 0;

    const byDomain = await ProblemStatement.aggregate([
      { $group: { _id: "$domainId", count: { $sum: 1 } } },
    ]);

    console.log("=== DATABASE PROBLEM STATEMENT STATS ===");
    console.log("Total Problem Statements in MongoDB:", total);
    console.log("Active Statements linked to Hackathon:", activeLinked);
    console.log("Breakdown by Track / Domain:");
    byDomain.forEach((d) => console.log(` - ${d._id || "Unassigned"}: ${d.count}`));
  } catch (err) {
    console.error("Error fetching stats:", err);
  } finally {
    await mongoose.disconnect();
  }
}

void getStats();
