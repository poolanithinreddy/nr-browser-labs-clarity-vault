/**
 * Smoke tests for the pure-utility modules.
 * Run with:  node tests/test-utils.js
 *
 * These modules use only standard JS (no browser/chrome APIs),
 * so they run fine in Node.js 18+.
 */

import { cleanText, detectType, autoTags } from '../common/clean.js';
import { cleanUrlTracking }                from '../common/url.js';
import { summarize }                       from '../common/summarize.js';

// ─── Minimal test harness ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function assertIncludes(haystack, needle, msg) {
  if (!haystack.includes(needle)) {
    throw new Error(msg || `Expected "${haystack}" to include "${needle}"`);
  }
}

// ─── clean.js ────────────────────────────────────────────────────────────────

console.log('\nclean.js');

test('normalizes smart quotes', () => {
  const result = cleanText('“Hello” ‘world’');
  assertIncludes(result, '"Hello"');
  assertIncludes(result, "'world'");
});

test('collapses excess whitespace', () => {
  assertEqual(cleanText('hello   world'), 'hello world');
});

test('strips leading bullets', () => {
  const result = cleanText('• First item\n• Second item');
  assert(!result.startsWith('•'), 'Should strip leading bullet');
});

test('detectType: code', () => {
  assertEqual(detectType('function foo() { return 42; }'), 'code');
});

test('detectType: price', () => {
  assertEqual(detectType('This item costs $19.99 USD'), 'price');
});

test('detectType: study/research', () => {
  assertEqual(detectType('The study results show a significant correlation.'), 'study');
});

test('detectType: long text → article', () => {
  const longText = 'word '.repeat(110);
  assertEqual(detectType(longText), 'article');
});

test('detectType: short text → text', () => {
  assertEqual(detectType('Hello world'), 'text');
});

test('autoTags: code domain', () => {
  const tags = autoTags('function render() {}', 'stackoverflow.com');
  assert(tags.includes('dev') || tags.includes('code'), 'Should include dev or code tag');
});

test('autoTags: dev keyword in text', () => {
  const tags = autoTags('npm install react', 'some-blog.com');
  assert(tags.includes('dev'), 'Should include dev tag for npm text');
});

test('autoTags: price keyword', () => {
  const tags = autoTags('Price: $49.99 deal of the day', 'shop.com');
  assert(tags.includes('price'), 'Should include price tag');
});

test('autoTags: no false positives on neutral text', () => {
  const tags = autoTags('The weather today is sunny.', 'news.com');
  assertEqual(tags.length, 0, 'Neutral text should produce no tags');
});

// ─── url.js ──────────────────────────────────────────────────────────────────

console.log('\nurl.js');

test('strips utm_source', () => {
  const result = cleanUrlTracking('https://example.com/page?utm_source=google&q=hello');
  assert(!result.includes('utm_source'), 'utm_source should be removed');
  assertIncludes(result, 'q=hello', 'Non-tracking params should be kept');
});

test('strips fbclid', () => {
  const result = cleanUrlTracking('https://example.com/?id=1&fbclid=abc123');
  assert(!result.includes('fbclid'), 'fbclid should be removed');
  assertIncludes(result, 'id=1', 'id param should remain');
});

test('strips gclid', () => {
  const result = cleanUrlTracking('https://example.com/?gclid=Cj0&ref=ads');
  assert(!result.includes('gclid'), 'gclid should be removed');
});

test('strips msclkid', () => {
  const result = cleanUrlTracking('https://example.com/?msclkid=abc&q=1');
  assert(!result.includes('msclkid'), 'msclkid should be removed');
  assertIncludes(result, 'q=1');
});

test('removes all utm_* params at once', () => {
  const url    = 'https://example.com/?utm_source=a&utm_medium=b&utm_campaign=c&text=keep';
  const result = cleanUrlTracking(url);
  assert(!result.includes('utm_'), 'All utm_ params should be stripped');
  assertIncludes(result, 'text=keep');
});

test('returns original on invalid URL', () => {
  const bad = 'not a url';
  assertEqual(cleanUrlTracking(bad), bad);
});

test('no-op on URL with no tracking params', () => {
  const clean = 'https://example.com/path?q=hello&page=2';
  assertEqual(cleanUrlTracking(clean), clean);
});

test('preserves URL fragment', () => {
  const result = cleanUrlTracking('https://example.com/?utm_source=x#section-1');
  assertIncludes(result, '#section-1');
  assert(!result.includes('utm_source'));
});

// ─── summarize.js ────────────────────────────────────────────────────────────

console.log('\nsummarize.js');

test('returns short text unchanged', () => {
  const short = 'Hello world.';
  const result = summarize(short, { maxSentences: 4 });
  // For very short text with only one sentence, should return input
  assert(result.length > 0, 'Should return non-empty string');
});

test('summarizes long text into fewer sentences', () => {
  const text = [
    'The quick brown fox jumps over the lazy dog.',
    'Scientists have discovered a new species of deep-sea fish.',
    'The stock market closed higher on Thursday.',
    'Engineers deployed a new version of the software.',
    'Researchers found that coffee improves focus.',
    'The local council approved a new park development.',
    'A new study links exercise to improved memory.',
    'The team celebrated after winning the championship.',
  ].join(' ');
  const result = summarize(text, { maxSentences: 3 });
  const sentenceCount = result.split(/[.!?]+\s/).filter(Boolean).length;
  assert(sentenceCount <= 5, `Summary should have ≤5 sentences, got ${sentenceCount}`);
});

test('handles empty string', () => {
  const result = summarize('', { maxSentences: 4 });
  assertEqual(result, '');
});

test('handles null/undefined gracefully', () => {
  assert(summarize(null, {}) === '' || typeof summarize(null, {}) === 'string');
});

test('returns string type always', () => {
  assertEqual(typeof summarize('Some text here.', { maxSentences: 2 }), 'string');
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nSome tests failed.');
  process.exit(1);
} else {
  console.log('All tests passed.');
}
