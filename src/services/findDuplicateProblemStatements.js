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

async function findDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const statements = await ProblemStatement.find({}).lean();
    console.log(`Analyzing ${statements.length} total problem statements...\n`);

    const titleMap = new Map();
    const slugMap = new Map();
    const descMap = new Map();

    statements.forEach((item) => {
      const normTitle = normalize(item.title);
      const normSlug = normalize(item.slug || item.id);
      const normDesc = normalize(item.description);

      if (normTitle) {
        if (!titleMap.has(normTitle)) titleMap.set(normTitle, []);
        titleMap.get(normTitle).push(item);
      }

      if (normSlug) {
        if (!slugMap.has(normSlug)) slugMap.set(normSlug, []);
        slugMap.get(normSlug).push(item);
      }

      if (normDesc) {
        if (!descMap.has(normDesc)) descMap.set(normDesc, []);
        descMap.get(normDesc).push(item);
      }
    });

    // Filter duplicate groups
    const titleDuplicates = Array.from(titleMap.entries()).filter(([_, group]) => group.length > 1);
    const slugDuplicates = Array.from(slugMap.entries()).filter(([_, group]) => group.length > 1);
    const descDuplicates = Array.from(descMap.entries()).filter(([_, group]) => group.length > 1);

    console.log("=== DUPLICATE ANALYSIS REPORT ===");
    console.log(`1. Duplicate Titles: ${titleDuplicates.length} title group(s) with duplicates`);
    titleDuplicates.forEach(([title, group], i) => {
      console.log(`\n  [Title Group ${i + 1}] "${group[0].title}" (${group.length} copies)`);
      group.forEach((item) => {
        console.log(`    - ID: ${item._id} | slug: ${item.slug || item.id} | Org: ${item.organization || "N/A"}`);
      });
    });

    console.log(`\n2. Duplicate Slugs/IDs: ${slugDuplicates.length} slug group(s) with duplicates`);
    slugDuplicates.forEach(([slug, group], i) => {
      console.log(`\n  [Slug Group ${i + 1}] "${slug}" (${group.length} copies)`);
      group.forEach((item) => {
        console.log(`    - ID: ${item._id} | Title: "${item.title}"`);
      });
    });

    console.log(`\n3. Duplicate Descriptions: ${descDuplicates.length} description group(s) with duplicates`);
    descDuplicates.forEach(([_, group], i) => {
      console.log(`\n  [Description Group ${i + 1}] Title: "${group[0].title}" (${group.length} copies)`);
      group.forEach((item) => {
        console.log(`    - ID: ${item._id} | slug: ${item.slug || item.id}`);
      });
    });

    const totalDuplicateDocs = new Set([
      ...titleDuplicates.flatMap(([_, g]) => g.slice(1).map((x) => String(x._id))),
      ...slugDuplicates.flatMap(([_, g]) => g.slice(1).map((x) => String(x._id))),
      ...descDuplicates.flatMap(([_, g]) => g.slice(1).map((x) => String(x._id))),
    ]);

    console.log("\n==================================");
    console.log(`Summary: Found ${totalDuplicateDocs.size} redundant duplicate document(s) in database.`);
    console.log(`Unique statements: ${statements.length - totalDuplicateDocs.size}`);
  } catch (err) {
    console.error("Error analyzing duplicates:", err);
  } finally {
    await mongoose.disconnect();
  }
}

void findDuplicates();
