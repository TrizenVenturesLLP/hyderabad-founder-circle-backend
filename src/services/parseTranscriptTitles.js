import fs from 'fs';

const path = 'C:/Users/pavan/.gemini/antigravity-ide/brain/d9f4b029-c527-40c2-9637-9be83c93b22b/.system_generated/logs/transcript.jsonl';

if (fs.existsSync(path)) {
  const content = fs.readFileSync(path, 'utf8');
  // Match lines like: 1. AI Multimodal Service Discovery Assistant... [Org: BLANK]
  const regex = /(\d+)\.\s+([^\r\n]+?\[Org:\s*[^\]]+\])/g;
  let match;
  const items = [];
  while ((match = regex.exec(content)) !== null) {
    items.push({ num: parseInt(match[1]), text: match[2] });
  }

  // Sort by number
  items.sort((a, b) => a.num - b.num);

  console.log(`=== RECOVERED ${items.length} PROBLEM STATEMENTS FROM LOGS ===\n`);
  items.forEach(item => {
    console.log(`${item.num}. ${item.text}`);
  });
} else {
  console.log('Transcript not found');
}
