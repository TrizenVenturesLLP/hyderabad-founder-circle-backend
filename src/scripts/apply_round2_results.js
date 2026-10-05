import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { Hackathon } from '../models/Hackathon.js';
import { ProblemStatement } from '../models/ProblemStatement.js';
import { HackathonProgram } from '../models/HackathonProgram.js';
import { JuryUser } from '../models/JuryUser.js';
import {
  buildHackathonLeaderboard,
  teamRoundOutcome,
  teamRound
} from '../services/hackathonLeaderboard.js';

await mongoose.connect(process.env.MONGODB_URI);

const PROGRAM_ID = '6abdd63d1de0d6770f316f1b';
const program = await HackathonProgram.findById(PROGRAM_ID);
if (!program) {
  throw new Error('Program not found');
}

// 1. Fetch all teams currently in Round 2
const r2Teams = await Hackathon.find({ hackathonId: program._id, round: { $gte: 2 } });
console.log(`Found ${r2Teams.length} teams in Round 2.`);

// Backup current state
const backupData = {
  timestamp: new Date().toISOString(),
  program: {
    _id: program._id,
    roundResults: program.roundResults
  },
  teams: r2Teams.map(t => ({
    _id: t._id,
    team_name: t.team_name,
    round: t.round,
    domainId: t.domainId
  }))
};
const backupFile = path.resolve(`./backup-round2-update-${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
console.log(`Saved backup to ${backupFile}`);

// 2. Define the 12 winners and their assigned domains
const winnerDefs = [
  // UI/UX
  { id: '6abfe4852f29b056bf2ff9d3', name: 'Hack reapers', domainId: 'ui-ux' },
  { id: '6abfe5e72f29b056bf300dec', name: 'Team Not Found', domainId: 'ui-ux' },
  { id: '6abfe3ab2f29b056bf2ff468', name: 'Silent Void', domainId: 'ui-ux' },

  // Vibe coding
  { id: '6abfe6222f29b056bf3013ca', name: 'VibeStak', domainId: 'vibe-coding' },
  { id: '6abfe62a2f29b056bf3014a1', name: 'Velora', domainId: 'vibe-coding' },
  { id: '6abfea932f29b056bf3081d8', name: 'The Phi', domainId: 'vibe-coding' },

  // Agentic AI
  { id: '6ac07b422f29b056bf31a7f3', name: 'CodeCommit', domainId: 'agentic-ai' },
  { id: '6ac00d902f29b056bf3164e2', name: 'It_Sparks', domainId: 'agentic-ai' },
  { id: '6ac0c28a2f29b056bf32550a', name: 'Sanraksh', domainId: 'agentic-ai' },

  // Web Development
  { id: '6abffaf62f29b056bf313d12', name: 'Team Kaizen', domainId: 'web-dev' },
  { id: '6ac061212f29b056bf318e47', name: 'The Shush Patrol', domainId: 'web-dev' },
  { id: '6ac051302f29b056bf317776', name: 'Vyom', domainId: 'web-dev' },
];

const winnerMap = new Map(winnerDefs.map(w => [String(w.id), w]));
const evaluatedTeamIds = r2Teams.map(t => t._id);
const qualifiedTeamIds = r2Teams
  .filter(t => winnerMap.has(String(t._id)))
  .map(t => t._id);

console.log(`Evaluated teams count: ${evaluatedTeamIds.length}`);
console.log(`Qualified teams count: ${qualifiedTeamIds.length}`);

if (qualifiedTeamIds.length !== 12) {
  throw new Error(`Expected 12 qualified teams, but found ${qualifiedTeamIds.length}`);
}

// 3. Update HackathonProgram roundResults
// Ensure Round 1 is published
const round1 = program.roundResults.find(r => r.round === 1);
if (round1 && !round1.publishedAt) {
  round1.publishedAt = new Date('2026-10-04T03:00:00.000Z');
}

// Filter out existing Round 2 result if any, and push new Round 2 result
program.roundResults = [
  ...program.roundResults.filter(r => r.round !== 2),
  {
    round: 2,
    cutoff: 75,
    qualifiedCount: qualifiedTeamIds.length,
    disqualifiedCount: evaluatedTeamIds.length - qualifiedTeamIds.length,
    evaluatedTeamIds,
    qualifiedTeamIds,
    decidedAt: new Date(),
    publishedAt: new Date()
  }
].sort((a, b) => a.round - b.round);

await program.save();
console.log('Updated HackathonProgram roundResults successfully.');

// 4. Update Hackathon team records:
// For 12 winners: set round: 3 and set their domainId
for (const winner of winnerDefs) {
  const res = await Hackathon.updateOne(
    { _id: winner.id, hackathonId: program._id },
    { $set: { round: 3, domainId: winner.domainId } }
  );
  console.log(`Updated winner ${winner.name} (${winner.domainId}): modified = ${res.modifiedCount}`);
}

// For remaining 31 teams: ensure round: 2 and assign domainId from statement if empty
const psIds = [...new Set(r2Teams.map(t => t.problem_statement_id).filter(Boolean))];
const statements = await ProblemStatement.find({ id: { $in: psIds } }).lean();
const psMap = new Map(statements.map(s => [s.id, s]));

for (const team of r2Teams) {
  if (!winnerMap.has(String(team._id))) {
    const ps = psMap.get(team.problem_statement_id);
    const domainId = ps?.domainId || 'web-dev';
    await Hackathon.updateOne(
      { _id: team._id, hackathonId: program._id },
      { $set: { round: 2, domainId } }
    );
  }
}
console.log('Updated remaining Round 2 teams as round 2 with domainId.');

// 5. Verification tests
console.log('\n--- VERIFICATION: Round 2 Leaderboard ---');
const boardR2 = await buildHackathonLeaderboard(program._id, 2);
console.log(`R2 Total teams: ${boardR2.teamCount}`);
console.log(`R2 Result: Qualified = ${boardR2.result?.qualifiedCount}, Disqualified = ${boardR2.result?.disqualifiedCount}`);

const qualifiedInBoard = boardR2.items.filter(item => item.qualification === 'qualified');
const disqualifiedInBoard = boardR2.items.filter(item => item.qualification === 'disqualified');
const pendingInBoard = boardR2.items.filter(item => item.qualification === 'pending');

console.log(`Leaderboard Qualified: ${qualifiedInBoard.length}`);
console.log(`Leaderboard Disqualified: ${disqualifiedInBoard.length}`);
console.log(`Leaderboard Pending: ${pendingInBoard.length}`);

console.log('\nQualified Teams in Round 2:');
qualifiedInBoard.forEach((item, i) => {
  console.log(` ${i + 1}. [${item.domainId}] ${item.teamName} (Round: ${item.teamRound}, Advanced: ${item.advanced})`);
});

console.log('\n--- VERIFICATION: Round 3 Leaderboard ---');
const boardR3 = await buildHackathonLeaderboard(program._id, 3);
console.log(`R3 Finalist teams count: ${boardR3.teamCount}`);
boardR3.items.forEach((item, i) => {
  console.log(` ${i + 1}. [${item.domainId}] ${item.teamName} (Round: ${item.teamRound})`);
});

console.log('\n--- VERIFICATION: teamRoundOutcome test ---');
const sampleWinner = await Hackathon.findById(winnerDefs[0].id).lean();
const winnerOutcome = teamRoundOutcome(program, sampleWinner, { publishedOnly: true });
console.log(`Sample Winner (${sampleWinner.team_name}) outcome:`, winnerOutcome);

const sampleDisqualified = await Hackathon.findById(r2Teams.find(t => !winnerMap.has(String(t._id)))._id).lean();
const dqOutcome = teamRoundOutcome(program, sampleDisqualified, { publishedOnly: true });
console.log(`Sample Disqualified (${sampleDisqualified.team_name}) outcome:`, dqOutcome);

await mongoose.disconnect();
console.log('\nDone!');
