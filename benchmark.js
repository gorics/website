const Benchmark = require('benchmark');

const suite = new Benchmark.Suite;

// Mock an array-like object similar to TouchList
const touchList = {
  0: { identifier: 1, clientX: 10, clientY: 10 },
  1: { identifier: 2, clientX: 20, clientY: 20 },
  2: { identifier: 3, clientX: 30, clientY: 30 },
  length: 3
};

suite.add('Array.from(changedTouches)', function() {
  let count = 0;
  for (const touch of Array.from(touchList)) {
    count += touch.identifier;
  }
})
.add('for loop over changedTouches', function() {
  let count = 0;
  for (let i = 0; i < touchList.length; i++) {
    const touch = touchList[i];
    count += touch.identifier;
  }
})
.on('cycle', function(event) {
  console.log(String(event.target));
})
.on('complete', function() {
  console.log('Fastest is ' + this.filter('fastest').map('name'));
})
.run({ 'async': false });
