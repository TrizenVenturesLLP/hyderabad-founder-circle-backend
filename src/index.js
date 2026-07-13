import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import rsvpRouter from "./routes/rsvp.js";

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:8080";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment.");
  process.exit(1);
}

const app = express();
app.use(
  cors({
    origin: CORS_ORIGIN.split(",").map((s) => s.trim()),
  }),
);
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.json({ service: "hfn-rsvp-backend", status: "ok" });
});

app.use("/api/rsvp", rsvpRouter);

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
