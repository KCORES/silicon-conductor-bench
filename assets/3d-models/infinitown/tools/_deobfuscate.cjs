const fs = require('fs');
const path = require('path');

const input = path.join(__dirname, '..', 'legacy', 'main.min.js');
const output = path.join(__dirname, '..', 'legacy', 'main.formatted.js');

const text = fs.readFileSync(input, 'utf8');
const formatted = text
  .replace(/;/g, ';\n')
  .replace(/\{/g, '{\n')
  .replace(/\}/g, '\n}\n')
  .replace(/,(?=[^\s])/g, ',\n');

fs.writeFileSync(output, formatted);
console.log('Wrote', output, 'bytes', fs.statSync(output).size);
