#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'donna-hay-recipes.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let fixed = 0;
data.recipes = data.recipes.map(r => {
  if (!r.image) return r;
  const m = r.image.match(/https?:\/\/[^/]+(https?:\/\/.+)$/);
  if (m) {
    fixed++;
    return { ...r, image: m[1] };
  }
  return r;
});

fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
console.log(`Fixed ${fixed} / ${data.recipes.length} image URLs.`);
