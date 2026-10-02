import mongoose from "mongoose";
import { ProblemStatement } from "../models/ProblemStatement.js";

const recoveredTitles = [
  "AI Multimodal Service Discovery Assistant",
  "AI Order Tracking Assistant",
  "AI Assistant for Workers",
  "Autonomous Product Return Resolution Agent",
  "AI Merchandising Assistant for Online Sellers",
  "AI-Powered Personalized Learning Platform",
  "AI Teaching & Assignment Evaluation Assistant",
  "AI Shopping Decision Assistant",
  "AI Student Performance Early-Warning System",
  "AI Lecture-to-Learning Material Generator",
  "Smart Hostel Complaint Management Platform",
  "AI Startup Idea Validation Agent",
  "AI Research Literature Discovery Agent",
  "AI Creator Content Planning Agent",
  "AI Content Repurposing Platform",
  "AI Marketing Campaign Diagnosis Agent",
  "AI Campaign Content Generation Agent",
  "AI Automated Marketing Publishing Agent",
  "AI Gig Worker Earnings Optimization Assistant",
  "AI Personal Financial Intelligence Platform",
  "AI EV Charging & Route Planning Platform",
  "AI Business Assistant for Local Retail Stores",
  "AI WhatsApp Order Agent for Local Stores",
  "AI Solar Installation Planning Platform",
  "AI Daily Operations Copilot",
  "AI Role-Based Employee Daily Assistant",
  "AI Gmail Action & Follow-Up Assistant",
  "AI Traffic Incident Detection & Response Platform",
  "Community Road Damage Reporting Platform",
  "AI Farm Decision Support Platform",
  "Smart Crop Disease Detection via Phone Camera",
  "AI Dynamic Travel Planning Agent",
  "AI Phishing Detection & Security Awareness Platform",
  "AI Health Report & Second-Opinion Companion",
  "AI Food Waste Prediction Platform",
  "AI Skill Gap & Career Roadmap Platform",
  "Community Skill Exchange Platform",
  "Accessible Digital Public Service Experience",
  "AI Mock Interview Panel Agent",
  "AI-Powered Student Assistance Chatbot for Department of Tech",
  "Recovery of Deleted Data and Associated Metadata from XFS",
  "Creating a Cyber Triage Tool to Streamline Digital Forensic",
  "AI Faculty Timetable Conflict Resolution Agent",
  "AI Software Incident Response Agent",
  "Client Project Feedback & Approval Portal",
  "Healthcare Appointment Experience Redesign",
  "Service Request Management Portal",
  "Smart Lost & Found Platform",
  "Product Warranty & Service Management Platform",
  "API Security Testing & Vulnerability Management Platform",
  "Smart Parking & Parking Space Discovery",
  "AI-Powered Waste Collection Optimization",
  "Hyperlocal Emergency Response Platform",
  "Smart Public Transport Route Planner",
  "Intelligent Carpooling & Employee Commute Platform",
  "Smart Streetlight Management System"
];

export async function restoreRecoveredProblemStatements() {
  try {
    let restoredCount = 0;
    for (let i = 0; i < recoveredTitles.length; i++) {
      const title = recoveredTitles[i];
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
      
      const exists = await ProblemStatement.findOne({ slug });
      if (!exists) {
        await ProblemStatement.create({
          slug,
          title,
          organization: "",
          department: "",
          targetDomain: "Agentic AI",
          difficulty: "Advanced",
          industry: "",
          scope: "",
          platformTech: "",
          description: `Problem statement details for ${title}.`,
          keyDeliverables: [],
          published: true,
          sortOrder: i + 100
        });
        restoredCount++;
      }
    }
    console.log(`[restore] Successfully restored ${restoredCount} recovered problem statements.`);
  } catch (err) {
    console.error("[restore] Failed:", err);
  }
}
