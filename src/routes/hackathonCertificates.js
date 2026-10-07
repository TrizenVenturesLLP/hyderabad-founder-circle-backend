import { Router } from "express";
import mongoose from "mongoose";
import { HackathonCertificate } from "../models/HackathonCertificate.js";
import { HackathonProgram } from "../models/HackathonProgram.js";
import { HackathonParticipantAccount } from "../models/HackathonParticipantAccount.js";
import { Hackathon } from "../models/Hackathon.js";
import { HackathonRoundCertificate } from "../models/HackathonRoundCertificate.js";
import { requireHackathonParticipant } from "../middleware/auth.js";
import { getPrivateObjectUrl } from "../lib/minio.js";
import { teamRoundOutcome } from "../services/hackathonLeaderboard.js";
import {
  certificateBelongsToParticipant,
  isEligibleCertificateTeam,
} from "../services/hackathonCertificates.js";

const router = Router();
const SIGNED_URL_EXPIRY_SECONDS = 15 * 60;

async function loadParticipantProgram(req, res) {
  const reference = String(req.params.hackathonId || "").trim();
  const program = mongoose.Types.ObjectId.isValid(reference)
    ? await HackathonProgram.findById(reference)
    : await HackathonProgram.findOne({ slug: reference.toLowerCase() });
  if (!program) {
    res.status(404).json({ message: "Hackathon not found." });
    return null;
  }
  if (String(program._id) !== req.hackathonParticipant.hackathonId) {
    res.status(403).json({ message: "You cannot access certificates for this Hackathon." });
    return null;
  }
  return program;
}

async function loadParticipant(req, program, res) {
  const account = await HackathonParticipantAccount.findById(req.hackathonParticipant.id)
    .select("normalizedEmail")
    .lean();
  if (!account) {
    res.status(401).json({ message: "Participant account is unavailable." });
    return null;
  }

  const team = await Hackathon.findOne({
    hackathonId: program._id,
    status: "active",
    $or: [{ email: account.normalizedEmail }, { "members.email": account.normalizedEmail }],
  })
    .select("_id hackathonId status round problem_statement_id team_name lead_name email members")
    .lean();
  if (!team) {
    res.status(403).json({ message: "You are not an active member of this Hackathon." });
    return null;
  }
  return { account, team };
}

router.use(requireHackathonParticipant);

router.get("/:hackathonId/certificate", async (req, res) => {
  try {
    const program = await loadParticipantProgram(req, res);
    if (!program) return;
    const participant = await loadParticipant(req, program, res);
    if (!participant) return;

    const certificate = await HackathonCertificate.findOne({
      hackathonId: program._id,
      participantId: participant.account._id,
      teamId: participant.team._id,
    })
      .select("participantName teamName certificateType status generatedAt")
      .lean();
    if (
      certificate?.status !== "generated" &&
      !(await isEligibleCertificateTeam(program, participant.team))
    ) {
      return res.status(403).json({ message: "Your team is not eligible for a participation certificate." });
    }
    return res.json({
      certificate: certificate
        ? {
            participantName: certificate.participantName,
            teamName: certificate.teamName,
            certificateType: certificate.certificateType,
            status: certificate.status === "generating" ? "pending" : certificate.status,
            generatedAt: certificate.generatedAt,
          }
        : {
            participantName:
              participant.team.email === participant.account.normalizedEmail
                ? participant.team.lead_name
                : participant.team.members.find(
                    (member) => member.email === participant.account.normalizedEmail,
                  )?.full_name || "Participant",
            teamName: participant.team.team_name,
            certificateType: "participation",
            status: "pending",
            generatedAt: null,
          },
    });
  } catch (error) {
    console.error("[hackathon participant certificate]", error);
    return res.status(500).json({ message: "Could not load your certificate." });
  }
});

router.get("/:hackathonId/certificate/download", async (req, res) => {
  try {
    const program = await loadParticipantProgram(req, res);
    if (!program) return;
    const participant = await loadParticipant(req, program, res);
    if (!participant) return;

    const certificate = await HackathonCertificate.findOne({
      hackathonId: program._id,
      participantId: participant.account._id,
      teamId: participant.team._id,
      status: "generated",
    })
      .select("hackathonId participantId teamId bucket objectKey")
      .lean();
    if (
      !certificateBelongsToParticipant(
        certificate,
        participant.account._id,
        program._id,
      ) ||
      String(certificate.teamId) !== String(participant.team._id)
    ) {
      return res.status(404).json({ message: "Your participation certificate is not ready yet." });
    }

    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const url = await getPrivateObjectUrl(certificate.bucket, certificate.objectKey, {
      expirySeconds: SIGNED_URL_EXPIRY_SECONDS,
      disposition,
    });
    return res.json({ url, expiresIn: SIGNED_URL_EXPIRY_SECONDS });
  } catch (error) {
    console.error("[hackathon participant certificate download]", error);
    return res.status(500).json({ message: "Could not create a certificate download link." });
  }
});

router.get("/:hackathonId/round-2-certificate", async (req, res) => {
  try {
    const program = await loadParticipantProgram(req, res);
    if (!program) return;

    const account = await HackathonParticipantAccount.findById(req.hackathonParticipant.id)
      .select("normalizedEmail")
      .lean();
    if (!account) {
      return res.status(401).json({ message: "Participant account is unavailable." });
    }

    const team = await Hackathon.findOne({
      hackathonId: program._id,
      $or: [{ email: account.normalizedEmail }, { "members.email": account.normalizedEmail }],
    })
      .select("_id hackathonId status round problem_statement_id")
      .lean();
    const outcome = team
      ? teamRoundOutcome(program, team, { publishedOnly: true })
      : null;
    const hasRound2Disqualification =
      team?.status === "active" && outcome?.round === 2 && outcome.status === "disqualified";
    if (!hasRound2Disqualification) {
      return res.json({ certificate: null });
    }

    const certificate = await HackathonRoundCertificate.findOne({
      hackathonId: program._id,
      participantId: account._id,
      teamId: team._id,
      round: 2,
      status: "generated",
    })
      .select("participantName teamName round generatedAt")
      .lean();
    return res.json({
      certificate: certificate
        ? {
            participantName: certificate.participantName,
            teamName: certificate.teamName,
            round: certificate.round,
            generatedAt: certificate.generatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("[hackathon participant round-2 certificate]", error);
    return res.status(500).json({ message: "Could not load your second-round certificate." });
  }
});

router.get("/:hackathonId/round-2-certificate/download", async (req, res) => {
  try {
    const program = await loadParticipantProgram(req, res);
    if (!program) return;

    const account = await HackathonParticipantAccount.findById(req.hackathonParticipant.id)
      .select("normalizedEmail")
      .lean();
    if (!account) {
      return res.status(401).json({ message: "Participant account is unavailable." });
    }

    const team = await Hackathon.findOne({
      hackathonId: program._id,
      $or: [{ email: account.normalizedEmail }, { "members.email": account.normalizedEmail }],
    })
      .select("_id hackathonId status round problem_statement_id")
      .lean();
    const outcome = team
      ? teamRoundOutcome(program, team, { publishedOnly: true })
      : null;
    if (team?.status !== "active" || outcome?.round !== 2 || outcome.status !== "disqualified") {
      return res.status(403).json({
        message: "A second-round selection certificate is not available to this participant.",
      });
    }

    const certificate = await HackathonRoundCertificate.findOne({
      hackathonId: program._id,
      participantId: account._id,
      teamId: team._id,
      round: 2,
      status: "generated",
    })
      .select("hackathonId participantId bucket objectKey")
      .lean();
    if (
      !certificateBelongsToParticipant(certificate, account._id, program._id)
    ) {
      return res.status(404).json({ message: "Your second-round certificate is not ready yet." });
    }

    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const url = await getPrivateObjectUrl(certificate.bucket, certificate.objectKey, {
      expirySeconds: SIGNED_URL_EXPIRY_SECONDS,
      disposition,
    });
    return res.json({ url, expiresIn: SIGNED_URL_EXPIRY_SECONDS });
  } catch (error) {
    console.error("[hackathon participant round-2 certificate download]", error);
    return res.status(500).json({ message: "Could not create a second-round certificate link." });
  }
});

export default router;
