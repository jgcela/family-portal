// Converts the old St. Mary volunteer page (volunteer-opportunities_202627.html,
// its OPPS list) into a file for Admin › Volunteer › Import from file.
//   node scripts/legacy/st-mary-volunteer.cjs <old-page.html> <out.json>
// The output holds volunteers' personal emails and phones: keep it out of git.
const fs = require('node:fs');
const vm = require('node:vm');

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('Usage: node scripts/legacy/st-mary-volunteer.cjs <old-page.html> <out.json>');
const html = fs.readFileSync(src, 'utf8');
const m = html.match(/const OPPS = (\[[\s\S]*?\n\]);/);
if (!m) throw new Error('OPPS list not found in the page.');
const OPPS = vm.runInNewContext(m[1]);
// The old page's own filter labels.
const CATEGORY = { classroom: 'Classroom', faith: 'Faith & ministry', events: 'Events' };
const md = (s) =>
  String(s)
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const opportunities = OPPS.map((o, i) => ({
  title: o.t,
  category: CATEGORY[o.type] ?? null,
  organizer: o.org ?? null,
  location: o.where ?? null,
  schedule: o.when ?? null,
  commitment: o.who ?? null,
  summary: o.desc ?? null,
  body: [o.area ? `**Area:** ${md(o.area)}` : '', o.li?.length ? `**${md(o.sub || 'Details')}**\n\n${o.li.map((x) => `- ${md(x)}`).join('\n')}` : '']
    .filter(Boolean)
    .join('\n\n'),
  actions: (o.cta ?? []).map(([label, url]) => ({ label, url })),
  visibility: 'families',
  sortOrder: (i + 1) * 10,
}));
fs.writeFileSync(out, JSON.stringify({ source: 'St. Mary volunteer page 2026-27 (flyers not included)', opportunities }, null, 1) + '\n');
console.log(`Wrote ${opportunities.length} opportunities to ${out}`);
