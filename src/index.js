import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import rsvpRouter from "./routes/rsvp.js";
import contactRouter from "./routes/contact.js";

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment.");
  process.exit(1);
}

/** Always allow these production frontends even if CapRover CORS_ORIGIN is outdated. */
const HARDCODED_ORIGINS = [
  "https://community.trizenventures.com",
  "https://ty.trizenventures.com",
  "http://ty.trizenventures.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (HARDCODED_ORIGINS.includes(origin)) return true;

  const allowed = CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.includes("*") || allowed.includes(origin)) return true;

  // Local / LAN for phone testing
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
      origin,
    )
  ) {
    return true;
  }

  // Any https://*.trizenventures.com
  return /^https:\/\/([a-z0-9-]+\.)*trizenventures\.com$/i.test(origin);
}

const app = express();

// Explicit CORS so OPTIONS preflight always gets the right headers on CapRover
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.json({ service: "hfn-rsvp-backend", status: "ok" });
});

app.use("/api/rsvp", rsvpRouter);
app.use("/api/contact", contactRouter);

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RSVP API listening on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
