import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import rsvpRouter from "./routes/rsvp.js";
import contactRouter from "./routes/contact.js";
import eventsRouter from "./routes/events.js";
import adminAuthRouter from "./routes/admin/auth.js";
import adminRsvpsRouter from "./routes/admin/rsvps.js";
import adminContactsRouter from "./routes/admin/contacts.js";
import adminEventsRouter from "./routes/admin/events.js";
import adminEmailsRouter from "./routes/admin/emails.js";
import { seedAdminAndEvents } from "./services/seed.js";

const PORT = Number(process.env.PORT) || 80;
const MONGODB_URI = process.env.MONGODB_URI || "";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";

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

  if (
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
      origin,
    )
  ) {
    return true;
  }

  return /^https:\/\/([a-z0-9-]+\.)*trizenventures\.com$/i.test(origin);
}

const app = express();
let mongoReady = false;

// Explicit CORS so OPTIONS preflight always gets headers (even during 5xx)
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

app.use(express.json({ limit: "8mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "hfn-rsvp-backend",
    status: "ok",
    mongo: mongoReady ? "connected" : "connecting",
  });
});

app.get("/health", (_req, res) => {
  res.status(mongoReady ? 200 : 503).json({
    ok: mongoReady,
    mongo: mongoReady ? "connected" : "connecting",
  });
});

app.use((req, res, next) => {
  if (!mongoReady && req.path.startsWith("/api/")) {
    return res.status(503).json({
      error: "Database is still connecting. Please try again in a moment.",
    });
  }
  next();
});

app.use("/api/rsvp", rsvpRouter);
app.use("/api/contact", contactRouter);
app.use("/api/events", eventsRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin/rsvps", adminRsvpsRouter);
app.use("/api/admin/contacts", adminContactsRouter);
app.use("/api/admin/events", adminEventsRouter);
app.use("/api/admin/emails", adminEmailsRouter);

async function connectMongoWithRetry() {
  if (!MONGODB_URI) {
    console.error(
      "Missing MONGODB_URI in environment. Set it in CapRover App Configs.",
    );
    return;
  }

  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
      });
      mongoReady = true;
      console.log("Connected to MongoDB");
      try {
        await seedAdminAndEvents();
      } catch (seedErr) {
        console.error(
          "[seed] Failed:",
          seedErr instanceof Error ? seedErr.message : seedErr,
        );
      }
      return;
    } catch (err) {
      mongoReady = false;
      console.error(
        `MongoDB connect attempt ${attempt}/${maxAttempts} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, Math.min(attempt * 1500, 10000)));
      }
    }
  }
  console.error("Could not connect to MongoDB after retries. API will stay degraded.");
}

async function start() {
  // Listen first so CapRover/nginx don't return 502 during Mongo connect
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RSVP API listening on http://0.0.0.0:${PORT}`);
  });

  await connectMongoWithRetry();
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
