// Converts the old St. Mary wishlist and staff-favorites pages (their LISTS and
// STAFF lists) into one file for Admin › Community › Import from file.
//   node scripts/legacy/st-mary-community.cjs <teacher-wishlists.html> <staff-favorites.html> <out.json>
// Staff favorites are for signed-in families, and leave out allergies and
// birthdays: the old page showed them to anyone with the link, and staff
// consent to publish them has not been confirmed. Keep the output out of git.
const fs = require('node:fs');
const vm = require('node:vm');

const [wishSrc, favSrc, out] = process.argv.slice(2);
if (!wishSrc || !favSrc || !out) throw new Error('Usage: node scripts/legacy/st-mary-community.cjs <wishlists.html> <favorites.html> <out.json>');
const grab = (html, name) => {
  const m = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`)) ?? html.match(new RegExp(`const ${name} = (\\[[^\\n]*\\]);`));
  if (!m) throw new Error(`${name} not found.`);
  return vm.runInNewContext(m[1]);
};

const wishHtml = fs.readFileSync(wishSrc, 'utf8');
const LISTS = grab(wishHtml, 'LISTS');
const WISH_GROUPS = Object.fromEntries([['preschool', 'Preschool'], ['elementary', 'Elementary (K–5)'], ['middle', 'Middle school (6–8)'], ['specials', 'Specials & staff']]);
const wish = LISTS.map(([g, name, role, url], i) => ({
  kind: 'wishlist',
  groupName: WISH_GROUPS[g] ?? null,
  name,
  role,
  url,
  visibility: 'public',
  sortOrder: (i + 1) * 10,
}));

const favHtml = fs.readFileSync(favSrc, 'utf8');
const FIELDS = grab(favHtml, 'FIELDS');
const TEAMS = Object.fromEntries(grab(favHtml, 'TEAMS'));
const STAFF = grab(favHtml, 'STAFF');
const LEFT_OUT = new Set(['Allergies']);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const fav = STAFF.map(([team, name, role, _birthday, f], i) => ({
  kind: 'favorites',
  groupName: TEAMS[team] ?? null,
  name,
  role: role || null,
  details: Object.entries(f ?? {})
    .map(([k, v]) => ({ label: FIELDS[Number(k)], value: clean(v) }))
    .filter((d) => d.label && d.value && !LEFT_OUT.has(d.label)),
  visibility: 'families',
  sortOrder: (i + 1) * 10,
}));

fs.writeFileSync(out, JSON.stringify({ source: 'St. Mary teacher wishlists and staff favorites 2026-27 (without allergies or birthdays)', items: [...wish, ...fav] }, null, 1) + '\n');
console.log(`${wish.length} wishlists, ${fav.length} staff cards → ${out}`);
