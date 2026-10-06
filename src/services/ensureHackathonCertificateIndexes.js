import { HackathonCertificate } from "../models/HackathonCertificate.js";

export async function ensureHackathonCertificateIndexes() {
  await HackathonCertificate.createIndexes();
}
