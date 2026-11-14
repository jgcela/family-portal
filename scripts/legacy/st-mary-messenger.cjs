// Converts the old St. Mary School Messenger archive (assets/messenger/manifest.js
// plus data/YYYY-MM-DD.html) into one file for Admin › School Messenger › Import.
//   node scripts/legacy/st-mary-messenger.cjs <manifest.js> <data-folder> <out.json>
// The HTML is copied as it is; the server cleans it (scripts, trackers, email
// footer) when it is imported.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const [manifest, dataDir, out] = process.argv.slice(2);
if (!manifest || !dataDir || !out) throw new Error('Usage: node scripts/legacy/st-mary-messenger.cjs <manifest.js> <data-folder> <out.json>');
const src = fs.readFileSync(manifest, 'utf8');
const m = src.match(/const MESSENGER_ISSUES = (\[[\s\S]*?\n\]);/);
if (!m) throw new Error('MESSENGER_ISSUES not found in the manifest.');
const list = vm.runInNewContext(m[1]);
const issues = list.map((i) => {
  const file = path.join(dataDir, path.basename(i.file));
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  return {
    issueDate: i.date,
    title: i.title,
    excerpt: i.excerpt ?? null,
    highlights: (i.highlights ?? []).map((h) => String(h).replace(/\s+/g, ' ').trim()).filter(Boolean),
    html: fs.readFileSync(file, 'utf8'),
    visibility: 'public',
  };
});
fs.writeFileSync(out, JSON.stringify({ source: 'St. Mary School Messenger archive 2026-27', issues }) + '\n');
console.log(`${issues.length} issues → ${out}`);
