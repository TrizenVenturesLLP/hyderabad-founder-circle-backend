import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { HackathonProgram } from "../models/HackathonProgram.js";

dotenv.config();

function resolveDomainId(source) {
  if (!source) return "agentic-ai";
  const str = String(source).toLowerCase();
  if (str.includes("ui") || str.includes("ux") || str.includes("design")) return "ui-ux";
  if (str.includes("web") || str.includes("fullstack") || str.includes("frontend")) return "web-dev";
  if (str.includes("vibe") || str.includes("code") || str.includes("coding")) return "vibe-coding";
  return "agentic-ai";
}

async function seedExactProblemStatements() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB.");

    // Ensure active Hackathon Program exists
    let program = await HackathonProgram.findOne({ slug: "ai-hack-x-mrdu-2026" });
    if (!program) {
      console.log("Creating default HackathonProgram (ai-hack-x-mrdu-2026)...");
      program = await HackathonProgram.create({
        slug: "ai-hack-x-mrdu-2026",
        title: "AI HACK X MRDU 2026",
        status: "active",
      });
    }

    // Read problemstatements.json
    const jsonPath = "c:/tri community/problemstatements.json";
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON file not found at ${jsonPath}`);
    }

    const rawData = fs.readFileSync(jsonPath, "utf8");
    const items = JSON.parse(rawData);

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("JSON file is empty or not an array.");
    }

    console.log(`📦 Loaded ${items.length} problem statements from ${jsonPath}`);

    const collection = mongoose.connection.db.collection("problemstatements");

    // Clear any previous entries to ensure a clean 74-statement seed
    await collection.deleteMany({});
    console.log("🧹 Cleared old problem statements collection.");

    const operations = items.map((item, index) => {
      let _id;
      if (item._id) {
        if (typeof item._id === "string") {
          _id = new mongoose.Types.ObjectId(item._id);
        } else if (item._id.$oid) {
          _id = new mongoose.Types.ObjectId(item._id.$oid);
        } else {
          _id = new mongoose.Types.ObjectId();
        }
      } else {
        _id = new mongoose.Types.ObjectId();
      }

      const slugVal = (item.slug || `ps-${index + 1}`).toLowerCase().trim();
      const idVal = slugVal.toUpperCase();
      const domainVal = resolveDomainId(item.targetDomain || item.domainId);
      const deliverablesList = Array.isArray(item.keyDeliverables)
        ? item.keyDeliverables
        : Array.isArray(item.deliverables)
          ? item.deliverables
          : [];

      const doc = {
        _id,
        slug: slugVal,
        id: idVal,
        title: item.title?.trim() || "Untitled Problem Statement",
        organization: item.organization?.trim() || "",
        department: item.department?.trim() || "",
        targetDomain: item.targetDomain?.trim() || "Agentic AI",
        domainId: domainVal,
        domainIds: [domainVal],
        difficulty: item.difficulty?.trim() || "Advanced",
        industry: item.industry?.trim() || "",
        scope: item.scope?.trim() || "",
        platformTech: item.platformTech?.trim() || "",
        platform: item.platformTech?.trim() || "",
        description: item.description?.trim() || "",
        keyDeliverables: deliverablesList,
        deliverables: deliverablesList,
        published: item.published !== undefined ? item.published : true,
        status: "active",
        sortOrder: item.sortOrder || index + 1,
        contactInfo: "8639648822",
        hackathonId: program._id,
        createdAt: item.createdAt?.$date ? new Date(item.createdAt.$date) : new Date(),
        updatedAt: item.updatedAt?.$date ? new Date(item.updatedAt.$date) : new Date(),
      };

      return {
        updateOne: {
          filter: { _id },
          update: { $set: doc },
          upsert: true,
        },
      };
    });

    const bulkRes = await collection.bulkWrite(operations);
    console.log("🎉 Seed finished successfully!");
    console.log(`   - Upserted/Inserted: ${bulkRes.upsertedCount + bulkRes.insertedCount + bulkRes.modifiedCount}`);

    const finalCount = await collection.countDocuments({});
    console.log(`📊 Total Problem Statements now in MongoDB: ${finalCount}`);
  } catch (error) {
    console.error("❌ Error seeding problem statements:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
  }
}

void seedExactProblemStatements();
