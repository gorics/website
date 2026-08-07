const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html>
<html>
<head></head>
<body>
  <div class="container"></div>
  <canvas></canvas>
</body>
</html>`, {
  url: "https://example.org/",
  referrer: "https://example.com/",
  contentType: "text/html",
  includeNodeLocations: true,
  storageQuota: 10000000
});

const { window } = dom;

// polyfill some things required by global-enhancements
window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.window = window;
global.document = window.document;
global.requestAnimationFrame = window.requestAnimationFrame;

// Load the original global-enhancements.js code
const code = fs.readFileSync('game/global-enhancements.js', 'utf8');

// evaluate it
window.eval(code);

// Run the benchmark
const ITERATIONS = 10000;
console.log(`Simulating ${ITERATIONS} resize events...`);

const start = Date.now();
for (let i = 0; i < ITERATIONS; i++) {
  // simulate resize event
  window.dispatchEvent(new window.Event('resize'));
}
const end = Date.now();

console.log(`Baseline Execution time: ${end - start} ms`);
