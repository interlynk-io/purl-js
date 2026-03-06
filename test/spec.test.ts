import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { PackageURL } from '../src/packageurl.js';

// Path to the local test data (copied from purl-spec)
const SPEC_TESTS_DIR = join(__dirname, '..', 'testdata');
const SPEC_TEST_FILE = join(SPEC_TESTS_DIR, 'spec', 'specification-test.json');
const TYPE_TESTS_DIR = join(SPEC_TESTS_DIR, 'types');

interface ComponentInput {
  type: string | null;
  namespace: string | null;
  name: string | null;
  version: string | null;
  qualifiers: Record<string, string> | null;
  subpath: string | null;
}

interface TestCase {
  description: string;
  test_group: string;
  test_type: 'parse' | 'build' | 'roundtrip';
  input: string | ComponentInput;
  expected_output: string | ComponentInput | null;
  expected_failure: boolean;
  expected_failure_reason: string | null;
}

interface TestFile {
  $schema: string;
  tests: TestCase[];
}

function loadTestFile(path: string): TestFile {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

function runParseTest(tc: TestCase) {
  const input = tc.input as string;
  if (tc.expected_failure) {
    expect(() => PackageURL.parse(input), `should fail: ${tc.description}`).toThrow();
  } else {
    const expected = tc.expected_output as ComponentInput;
    const result = PackageURL.parse(input);
    expect(result.type).toBe(expected.type);
    expect(result.namespace ?? null).toBe(expected.namespace ?? null);
    expect(result.name).toBe(expected.name);
    expect(result.version ?? null).toBe(expected.version ?? null);
    expect(result.qualifiers ?? null).toEqual(expected.qualifiers ?? null);
    expect(result.subpath ?? null).toBe(expected.subpath ?? null);
  }
}

function runBuildTest(tc: TestCase) {
  const input = tc.input as ComponentInput;
  if (tc.expected_failure) {
    expect(
      () =>
        new PackageURL(
          input.type ?? '',
          input.namespace,
          input.name ?? '',
          input.version,
          input.qualifiers,
          input.subpath
        ),
      `should fail: ${tc.description}`
    ).toThrow();
  } else {
    const expected = tc.expected_output as string;
    const purl = new PackageURL(
      input.type!,
      input.namespace,
      input.name!,
      input.version,
      input.qualifiers,
      input.subpath
    );
    expect(purl.toString()).toBe(expected);
  }
}

function runRoundtripTest(tc: TestCase) {
  const input = tc.input as string;
  const expected = tc.expected_output as string;
  if (tc.expected_failure) {
    expect(() => PackageURL.parse(input), `should fail: ${tc.description}`).toThrow();
  } else {
    const parsed = PackageURL.parse(input);
    expect(parsed.toString()).toBe(expected);
  }
}

function runTestCase(tc: TestCase) {
  switch (tc.test_type) {
    case 'parse':
      runParseTest(tc);
      break;
    case 'build':
      runBuildTest(tc);
      break;
    case 'roundtrip':
      runRoundtripTest(tc);
      break;
    default:
      throw new Error(`unknown test_type: ${tc.test_type}`);
  }
}

// Run the core specification tests
describe('specification tests', () => {
  const testFile = loadTestFile(SPEC_TEST_FILE);
  for (const tc of testFile.tests) {
    it(`[${tc.test_type}] ${tc.description}`, () => {
      runTestCase(tc);
    });
  }
});

// Run all type-specific tests
const typeTestFiles = readdirSync(TYPE_TESTS_DIR)
  .filter((f) => f.endsWith('-test.json'))
  .sort();

for (const fileName of typeTestFiles) {
  const typeName = fileName.replace('-test.json', '');
  describe(`type: ${typeName}`, () => {
    const testFile = loadTestFile(join(TYPE_TESTS_DIR, fileName));
    for (const tc of testFile.tests) {
      it(`[${tc.test_type}] ${tc.description}`, () => {
        runTestCase(tc);
      });
    }
  });
}
