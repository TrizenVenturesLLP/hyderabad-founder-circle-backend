import fs from 'fs';

const path = 'C:/Users/pavan/.gemini/antigravity-ide/brain/d9f4b029-c527-40c2-9637-9be83c93b22b/.system_generated/logs/transcript_full.jsonl';

if (fs.existsSync(path)) {
  const content = fs.readFileSync(path, 'utf8');
  console.log('Searching transcript_full.jsonl...');
  
  // Extract all occurrences of items 1-91 from stdout logs in transcript
  const lines = content.split('\n');
  const recoveredLines = [];
  for (const line of lines) {
    if (line.includes('TOTAL_STORED_COUNT') || line.includes('AI Multimodal Service Discovery Assistant')) {
      recoveredLines.push(line);
    }
  }

  console.log(`Found ${recoveredLines.length} relevant lines in transcript_full.jsonl.`);
  recoveredLines.forEach((l, i) => {
    console.log(`--- LINE ${i+1} ---`);
    console.log(l.substring(0, 1500));
  });
} else {
  console.log('transcript_full.jsonl not found');
}
