#!/usr/bin/env node
/**
 * One-time script: decode HTML entities in title/description fields
 * across all recipe library JSON files.
 */
const fs   = require('fs');
const path = require('path');

function decodeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const FILES = [
  '../data/recipe-library.json',
  '../data/jamie-oliver-recipes.json',
  '../data/donna-hay-recipes.json',
  '../data/weekly-recipes.json',
];

for (const rel of FILES) {
  const file = path.join(__dirname, rel);
  if (!fs.existsSync(file)) { console.log(`  skip (not found): ${rel}`); continue; }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const recipes = data.recipes || data;
  let fixed = 0;

  (Array.isArray(recipes) ? recipes : []).forEach(r => {
    const origTitle = r.title;
    const origDesc  = r.description;
    r.title       = decodeHtml(r.title);
    r.description = decodeHtml(r.description);
    if (r.title !== origTitle || r.description !== origDesc) fixed++;
  });

  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  ${path.basename(file)}: fixed ${fixed} recipes`);
}
console.log('Done.');
