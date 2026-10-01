const fs = require('fs');
const path = require('path');

const text = fs.readFileSync(path.join(__dirname, '..', 'legacy', 'main.min.js'), 'utf8');
const re = /assets\/main\/[^"']+/g;
const assets = [...new Set([...text.matchAll(re)].map((m) => m[0]))].sort();
console.log(assets.join('\n'));
console.log('\nTotal:', assets.length);
