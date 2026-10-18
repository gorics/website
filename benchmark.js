const touches = {
  length: 5,
  0: { identifier: 1, clientX: 10, clientY: 10 },
  1: { identifier: 2, clientX: 20, clientY: 20 },
  2: { identifier: 3, clientX: 30, clientY: 30 },
  3: { identifier: 4, clientX: 40, clientY: 40 },
  4: { identifier: 5, clientX: 50, clientY: 50 }
};

// Make it iterable like TouchList
touches[Symbol.iterator] = function* () {
  for (let i = 0; i < this.length; i++) {
    yield this[i];
  }
};

const ITERATIONS = 1000000;

function runBaseline() {
  const start = performance.now();
  let count = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    for (const touch of Array.from(touches)) {
      count += touch.identifier;
    }
  }
  const end = performance.now();
  return end - start;
}

function runOptimized() {
  const start = performance.now();
  let count = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    for (let j = 0; j < touches.length; j++) {
      const touch = touches[j];
      count += touch.identifier;
    }
  }
  const end = performance.now();
  return end - start;
}

console.log('Warming up...');
runBaseline();
runOptimized();

console.log('Running benchmark...');
const baselineTime = runBaseline();
const optimizedTime = runOptimized();

console.log(`Baseline (Array.from): ${baselineTime.toFixed(2)}ms`);
console.log(`Optimized (Standard for loop): ${optimizedTime.toFixed(2)}ms`);
console.log(`Improvement: ${((baselineTime - optimizedTime) / baselineTime * 100).toFixed(2)}% faster`);
