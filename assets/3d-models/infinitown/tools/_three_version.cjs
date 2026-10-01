const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'vendor', 'three.min.js');
const text = fs.readFileSync(file, 'utf8');

const patterns = [
  /THREE\.REVISION\s*=\s*["'](\d+)["']/,
  /REVISION\s*:\s*["'](\d+)["']/,
  /"r(\d{2,3})"/,
  /three\.js r(\d+)/i,
  /build: r(\d+)/i,
];

for (const re of patterns) {
  const m = text.match(re);
  if (m) console.log(re.toString(), '->', m[1] || m[0]);
}

// Search for revision-like assignments near start/end
for (const slice of [text.slice(0, 2000), text.slice(-2000)]) {
  const m = slice.match(/REVISION[^,]{0,30}/g);
  if (m) console.log('slice hits:', m);
}

// Heuristic: legacy API markers
const markers = {
  'JSONLoader (removed later)': text.includes('JSONLoader'),
  'Geometry (not BufferGeometry only)': /function\s+\w+\(\)\{this\.vertices=\[\]/.test(text) || text.includes('THREE.Geometry'),
  'Face3': text.includes('Face3'),
  'BufferGeometry': text.includes('BufferGeometry'),
};
console.log('API markers:', markers);
