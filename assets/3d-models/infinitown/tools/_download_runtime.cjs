const fs = require('fs');
const path = require('path');

const BASE = 'https://demos.littleworkshop.fr/demos/infinitown/';
const OUT = path.join(__dirname, '..');
const paths = [
  'textures/white.png',
  'textures/normal.png',
  'textures/vignetting.png',
  'css/main.css',
];

async function download(relativePath) {
  const url = BASE + relativePath;
  const target = path.join(OUT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const res = await fetch(url, {
    headers: {
      Referer: BASE,
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) throw new Error(`${relativePath} -> ${res.status}`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  console.log('saved', relativePath);
}

(async () => {
  for (const p of paths) await download(p);
})();
