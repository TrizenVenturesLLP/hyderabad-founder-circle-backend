import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set in .env file");
  process.exit(1);
}

async function uploadProblemStatements() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB successfully.");

    // Resolve JSON path
    const jsonPath = path.resolve(process.cwd(), "src/data/problemstatements.json");
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON file not found at ${jsonPath}`);
    }

    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const items = JSON.parse(rawData);

    if (!Array.isArray(items) || items.length === 0) {
      console.log("⚠️ No problem statements found in JSON file.");
      process.exit(0);
    }

    console.log(`📦 Loaded ${items.length} problem statements from ${jsonPath}`);

    const collection = mongoose.connection.db.collection("problemstatements");

    const operations = items.map((item, index) => {
      const slugVal = item.slug || `ps-${index + 1}`;
      const idVal = item.id || slugVal.toUpperCase();
      const domainVal = item.targetDomain || item.domainId || "General";
      const deliverablesList = Array.isArray(item.keyDeliverables)
        ? item.keyDeliverables
        : Array.isArray(item.deliverables)
          ? item.deliverables
          : [];

      // Clean MongoDB ObjectId if present
      let _id = undefined;
      if (item._id) {
        if (typeof item._id === "string") {
          try {
            _id = new mongoose.Types.ObjectId(item._id);
          } catch {
            _id = item._id;
          }
        } else if (item._id.$oid) {
          _id = new mongoose.Types.ObjectId(item._id.$oid);
        }
      }

      // Unified document preserving all schema properties
      const doc = {
        title: item.title?.trim() || "Untitled Problem Statement",
        slug: slugVal,
        id: idVal,
        organization: item.organization?.trim() || "",
        department: item.department?.trim() || "",
        targetDomain: domainVal,
        domainId: domainVal,
        domainIds: [domainVal],
        difficulty: item.difficulty?.trim() || "Advanced",
        industry: item.industry?.trim() || "",
        scope: item.scope?.trim() || "",
        platformTech: item.platformTech?.trim() || item.platform?.trim() || "",
        platform: item.platform?.trim() || item.platformTech?.trim() || "",
        description: item.description?.trim() || "",
        keyDeliverables: deliverablesList,
        deliverables: deliverablesList,
        published: item.published !== undefined ? item.published : true,
        status: item.status || "active",
        sortOrder: item.sortOrder || index + 1,
        contactInfo: item.contactInfo || "8639648822",
        updatedAt: new Date(),
      };

      if (!doc.createdAt) {
        doc.createdAt = item.createdAt?.$date ? new Date(item.createdAt.$date) : new Date();
      }

      const filter = _id ? { _id } : { slug: slugVal };

      return {
        updateOne: {
          filter,
          update: { $set: doc },
          upsert: true,
        },
      };
    });

    const result = await collection.bulkWrite(operations);
    console.log("🎉 Upload finished successfully!");
    console.log(`   - Matched: ${result.matchedCount}`);
    console.log(`   - Modified: ${result.modifiedCount}`);
    console.log(`   - Upserted: ${result.upsertedCount}`);

    const totalCount = await collection.countDocuments({});
    console.log(`📊 Total Problem Statements currently in DB collection 'problemstatements': ${totalCount}`);
  } catch (error) {
    console.error("❌ Error uploading problem statements:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
  }
}

void uploadProblemStatements();
