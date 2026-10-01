const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'legacy', 'main.min.js');
const outDir = path.join(__dirname, '..', 'extracted', 'modules');
const indexPath = path.join(__dirname, '..', 'extracted', 'function-index.txt');

const text = fs.readFileSync(bundlePath, 'utf8');
const marker = /(\d+):\[function\(t,e,n\)/g;
const hits = [];
let match;
while ((match = marker.exec(text)) !== null) {
  hits.push({ id: Number(match[1]), start: match.index });
}

hits.sort((a, b) => a.start - b.start);
const modules = hits.map((hit, index) => {
  const end = index + 1 < hits.length ? hits[index + 1].start : text.lastIndexOf('},{},[');
  return {
    id: hit.id,
    code: text.slice(hit.start, end),
  };
});

fs.mkdirSync(outDir, { recursive: true });
const lines = [`Infinitown browserify modules extracted from legacy/main.min.js`, `Total modules: ${modules.length}`, ''];

for (const mod of modules) {
  const file = path.join(outDir, `module-${String(mod.id).padStart(3, '0')}.js`);
  fs.writeFileSync(file, mod.code);
  lines.push(`module ${mod.id}\t${path.relative(path.join(__dirname, '..'), file)}\t${mod.code.length} bytes`);
}

fs.writeFileSync(indexPath, lines.join('\n') + '\n');
console.log(`Extracted ${modules.length} modules to ${outDir}`);
