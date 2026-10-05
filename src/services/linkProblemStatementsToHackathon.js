import dotenv from "dotenv";
import mongoose from "mongoose";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { ProblemStatement } from "../models/ProblemStatement.js";

dotenv.config();

const ALLOWED_DOMAIN_IDS = ["ui-ux", "web-dev", "vibe-coding", "agentic-ai"];

function resolveDomainId(source) {
  if (!source) return "agentic-ai";
  const str = String(source).toLowerCase();
  if (str.includes("ui") || str.includes("ux") || str.includes("design")) return "ui-ux";
  if (str.includes("web") || str.includes("fullstack") || str.includes("frontend")) return "web-dev";
  if (str.includes("vibe") || str.includes("code") || str.includes("coding")) return "vibe-coding";
  return "agentic-ai";
}

async function linkStatements() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    let program = await HackathonProgram.findOne({ slug: "ai-hack-x-mrdu-2026" });
    if (!program) {
      console.log("Creating default HackathonProgram ai-hack-x-mrdu-2026...");
      program = await HackathonProgram.create({
        slug: "ai-hack-x-mrdu-2026",
        title: "AI HACK X MRDU 2026",
        status: "active",
      });
    }

    console.log("Hackathon Program ID:", program._id);

    const totalCount = await ProblemStatement.countDocuments({});
    console.log("Total ProblemStatements in DB:", totalCount);

    // Link all problem statements to hackathon program and set status to active
    const linkRes = await ProblemStatement.updateMany(
      { $or: [{ hackathonId: null }, { hackathonId: { $exists: false } }] },
      { $set: { hackathonId: program._id, status: "active" } }
    );
    console.log("Updated unlinked statements:", linkRes);

    // Ensure every statement has a valid domainId and domainIds
    const statements = await ProblemStatement.find({ hackathonId: program._id }).lean();
    let updatedDomains = 0;

    for (const s of statements) {
      const validDomain = resolveDomainId(s.domainId || s.targetDomain);
      if (s.domainId !== validDomain || !Array.isArray(s.domainIds) || !s.domainIds.includes(validDomain)) {
        await ProblemStatement.updateOne(
          { _id: s._id },
          { $set: { domainId: validDomain, domainIds: [validDomain] } }
        );
        updatedDomains++;
      }
    }

    console.log(`✅ Fixed domainId/domainIds for ${updatedDomains} statements.`);

    const linkedCount = await ProblemStatement.countDocuments({ hackathonId: program._id });
    console.log(`🎉 Total problem statements linked and active for ${program.slug}: ${linkedCount}`);
  } catch (err) {
    console.error("Error linking statements:", err);
  } finally {
    await mongoose.disconnect();
  }
}

void linkStatements();
