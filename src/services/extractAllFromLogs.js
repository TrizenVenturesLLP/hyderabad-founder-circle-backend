import fs from 'fs';
import path from 'path';

const logDir = 'C:/Users/pavan/.gemini/antigravity-ide/brain/d9f4b029-c527-40c2-9637-9be83c93b22b/.system_generated/';

function walkDir(dir) {
  let files = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      files = files.concat(walkDir(filePath));
    } else {
      files.push(filePath);
    }
  });
  return files;
}

try {
  const allFiles = walkDir(logDir);
  const titlesFound = new Set();
  
  for (const f of allFiles) {
    if (f.endsWith('.js') || f.endsWith('.json')) continue;
    try {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('[Org:') || line.includes('Title:')) {
          titlesFound.add(line.trim());
        }
      }
    } catch (_e) {}
  }

  console.log(`=== RECOVERED TITLES FROM LOGS (${titlesFound.size} TOTAL) ===`);
  Array.from(titlesFound).forEach(t => console.log(t));
} catch (err) {
  console.error(err);
}
