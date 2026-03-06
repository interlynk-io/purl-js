import { bench, describe } from 'vitest';
import { percentEncode, percentDecode } from '../src/encode.js';

const short = 'express';
const medium = 'https://repo.example.com/path/to/artifact?v=1';
const long = 'https://registry.example.com/v2/'.repeat(50);
const unicode = '日本語パッケージ名前テスト';

const encodedShort = percentEncode(short);
const encodedMedium = percentEncode(medium);
const encodedLong = percentEncode(long);
const encodedUnicode = percentEncode(unicode);

describe('percentEncode', () => {
  bench('short (7 chars)', () => { percentEncode(short); });
  bench('medium (46 chars)', () => { percentEncode(medium); });
  bench('long (1550 chars)', () => { percentEncode(long); });
  bench('unicode (12 chars)', () => { percentEncode(unicode); });
});

describe('percentDecode', () => {
  bench('short', () => { percentDecode(encodedShort); });
  bench('medium', () => { percentDecode(encodedMedium); });
  bench('long', () => { percentDecode(encodedLong); });
  bench('unicode', () => { percentDecode(encodedUnicode); });
});
