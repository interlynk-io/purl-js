import { bench, describe } from 'vitest';
import { percentEncode, percentDecode } from '../src/encode.js';

// --- Test inputs at various sizes and encode ratios ---

// Mostly ASCII / unreserved — best case for encode (little work)
const asciiShort = 'express';
const asciiMedium = 'my-cool-package-name-with-dashes';
const asciiLong = 'a]b'.repeat(100) + '-normal-suffix';

// Heavy encoding — worst case (every char needs %XX)
const specialShort = '日本語';
const specialMedium = '日本語パッケージ名前テスト';
const specialLong = '日本語'.repeat(200);

// Mixed — realistic qualifier values
const mixedShort = 'linux/amd64';
const mixedMedium = 'https://repo.example.com/path/to/artifact?v=1';
const mixedLong = 'https://registry.example.com/v2/'.repeat(50);

// Pre-encode inputs for decode benchmarks
const encodedAsciiShort = percentEncode(asciiShort);
const encodedAsciiMedium = percentEncode(asciiMedium);
const encodedAsciiLong = percentEncode(asciiLong);
const encodedSpecialShort = percentEncode(specialShort);
const encodedSpecialMedium = percentEncode(specialMedium);
const encodedSpecialLong = percentEncode(specialLong);
const encodedMixedShort = percentEncode(mixedShort);
const encodedMixedMedium = percentEncode(mixedMedium);
const encodedMixedLong = percentEncode(mixedLong);

// ---- percentEncode ----

describe('percentEncode — ASCII (unreserved-heavy)', () => {
  bench('short (7 chars)', () => { percentEncode(asciiShort); });
  bench('medium (32 chars)', () => { percentEncode(asciiMedium); });
  bench('long (303 chars)', () => { percentEncode(asciiLong); });
});

describe('percentEncode — special (encode-heavy)', () => {
  bench('short (3 chars / 9 bytes)', () => { percentEncode(specialShort); });
  bench('medium (12 chars / 36 bytes)', () => { percentEncode(specialMedium); });
  bench('long (600 chars / 1800 bytes)', () => { percentEncode(specialLong); });
});

describe('percentEncode — mixed (realistic)', () => {
  bench('short (11 chars)', () => { percentEncode(mixedShort); });
  bench('medium (46 chars)', () => { percentEncode(mixedMedium); });
  bench('long (1550 chars)', () => { percentEncode(mixedLong); });
});

// ---- percentDecode ----

describe('percentDecode — ASCII (no %XX sequences)', () => {
  bench('short', () => { percentDecode(encodedAsciiShort); });
  bench('medium', () => { percentDecode(encodedAsciiMedium); });
  bench('long', () => { percentDecode(encodedAsciiLong); });
});

describe('percentDecode — special (dense %XX)', () => {
  bench('short', () => { percentDecode(encodedSpecialShort); });
  bench('medium', () => { percentDecode(encodedSpecialMedium); });
  bench('long', () => { percentDecode(encodedSpecialLong); });
});

describe('percentDecode — mixed (realistic)', () => {
  bench('short', () => { percentDecode(encodedMixedShort); });
  bench('medium', () => { percentDecode(encodedMixedMedium); });
  bench('long', () => { percentDecode(encodedMixedLong); });
});
