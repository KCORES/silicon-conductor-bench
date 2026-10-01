const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'legacy', 'main.min.js');
const text = fs.readFileSync(bundlePath, 'utf8');

const moduleIds = [...text.matchAll(/\{(\d+):\[function\(t,e,n\)/g)].map((m) => m[1]);
console.log('module count:', moduleIds.length);

const jsonRefs = [...text.matchAll(/"([^"]+\.json)"/g)].map((m) => m[1]);
console.log('json refs:', [...new Set(jsonRefs)].sort());

const assetRefs = [...text.matchAll(/"((?:assets|js|css)\/[^"]+)"/g)].map((m) => m[1]);
console.log('asset refs:', [...new Set(assetRefs)].sort());

const fnNames = [...text.matchAll(/function ([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]);
const fnCounts = {};
for (const name of fnNames) fnCounts[name] = (fnCounts[name] || 0) + 1;
const topFns = Object.entries(fnCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40);
console.log('top function names:', topFns);
