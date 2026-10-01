const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const target = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'three.min.js'));
const targetMd5 = crypto.createHash('md5').update(target).digest('hex');
console.log('target md5:', targetMd5, 'bytes:', target.length);

const revisions = [71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95];

(async () => {
  for (const r of revisions) {
    const url = `https://raw.githubusercontent.com/mrdoob/three.js/r${r}/build/three.min.js`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      const match = md5 === targetMd5 ? ' *** MATCH ***' : '';
      if (match || Math.abs(buf.length - target.length) < 50000) {
        console.log(`r${r}: ${buf.length} bytes md5=${md5}${match}`);
      }
    } catch (err) {
      // ignore
    }
  }
})();
