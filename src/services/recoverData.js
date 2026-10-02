import fs from 'fs';
import path from 'path';

const logPath = 'C:/Users/pavan/.gemini/antigravity-ide/brain/d9f4b029-c527-40c2-9637-9be83c93b22b/.system_generated/logs/transcript_full.jsonl';

if (fs.existsSync(logPath)) {
  const fileContent = fs.readFileSync(logPath, 'utf8');
  console.log('Reading transcript_full.jsonl ...');
  
  // Search for json objects with problem statements or title
  const titleRegex = /"title":"([^"]+)"/g;
  let match;
  const titles = new Set();
  while ((match = titleRegex.exec(fileContent)) !== null) {
    titles.add(match[1]);
  }
  console.log(`Found ${titles.size} unique titles in current conversation transcript:`);
  Array.from(titles).forEach((t, i) => console.log(`${i+1}. ${t}`));
} else {
  console.log('Log file not found');
}
