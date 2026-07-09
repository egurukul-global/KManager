import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'src/main.js',
  'src/styles.css',
  'src/pages/income.js',
  'src/pages/transfer.js',
  'src/pages/budgets.js',
  'src/pages/dashboard.js',
  'src/pages/rates.js'
];

const re = /<<<<<<< Updated upstream\r?\n[\s\S]*?=======\r?\n([\s\S]*?)>>>>>>> Stashed changes\r?\n/g;

for (const rel of files) {
  const filePath = path.join(root, rel);
  const original = fs.readFileSync(filePath, 'utf8');
  const count = (original.match(/<<<<<<< Updated upstream/g) || []).length;
  const resolved = original.replace(re, '$1');
  if (resolved.includes('<<<<<<<')) {
    console.error(`${rel}: still has conflict markers`);
    process.exitCode = 1;
    continue;
  }
  fs.writeFileSync(filePath, resolved);
  console.log(`${rel}: resolved ${count} conflict(s)`);
}
