/**
 * ECMA-427 Compliance Test Suite
 *
 * Systematic tests for every rule in the Package URL specification:
 *   - Parsing algorithm (right-to-left, 8 steps)
 *   - Building algorithm (toString canonical form)
 *   - Percent-encoding / decoding
 *   - Qualifier rules
 *   - Subpath rules
 *   - Type-specific normalization
 *   - API contracts (immutability, equality, validation)
 *
 * These complement the upstream data-driven tests in spec.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  PackageURL,
  tryParse,
  isValid,
  validateString,
  validate,
  lookupType,
  registeredTypes,
  registerType,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// 1. PARSING ALGORITHM — Scheme
// ---------------------------------------------------------------------------
describe('parse: scheme', () => {
  it('accepts lowercase pkg:', () => {
    const p = PackageURL.parse('pkg:npm/foo');
    expect(p.type).toBe('npm');
  });

  it('accepts uppercase PKG: (scheme is case-insensitive)', () => {
    const p = PackageURL.parse('PKG:npm/foo');
    expect(p.type).toBe('npm');
  });

  it('accepts mixed-case Pkg:', () => {
    const p = PackageURL.parse('Pkg:npm/foo');
    expect(p.type).toBe('npm');
  });

  it('rejects missing scheme', () => {
    expect(() => PackageURL.parse('npm/foo@1.0')).toThrow();
  });

  it('rejects wrong scheme', () => {
    expect(() => PackageURL.parse('maven:org.apache/commons@1.0')).toThrow(/scheme/i);
  });

  it('rejects encoded colon in scheme position (pkg%3A)', () => {
    expect(() => PackageURL.parse('pkg%3Anpm/foo')).toThrow();
  });

  it('rejects empty input', () => {
    expect(() => PackageURL.parse('')).toThrow();
  });

  it('rejects non-string input', () => {
    // @ts-expect-error — testing runtime
    expect(() => PackageURL.parse(null)).toThrow();
    // @ts-expect-error
    expect(() => PackageURL.parse(undefined)).toThrow();
    // @ts-expect-error
    expect(() => PackageURL.parse(42)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. PARSING ALGORITHM — Type
// ---------------------------------------------------------------------------
describe('parse: type', () => {
  it('lowercases type', () => {
    expect(PackageURL.parse('pkg:NPM/foo').type).toBe('npm');
    expect(PackageURL.parse('pkg:PyPI/foo').type).toBe('pypi');
    expect(PackageURL.parse('pkg:GOLANG/golang.org/x/tools').type).toBe('golang');
  });

  it('strips single leading slash after scheme', () => {
    const p = PackageURL.parse('pkg:/npm/foo');
    expect(p.type).toBe('npm');
    expect(p.name).toBe('foo');
  });

  it('strips double leading slashes after scheme', () => {
    const p = PackageURL.parse('pkg://npm/foo');
    expect(p.type).toBe('npm');
  });

  it('strips triple leading slashes after scheme', () => {
    const p = PackageURL.parse('pkg:///npm/foo');
    expect(p.type).toBe('npm');
  });

  it('accepts valid type characters (letters, digits, period, plus, dash)', () => {
    // Synthetic type with all allowed chars
    const p = PackageURL.parse('pkg:a1.b+c-d/foo');
    expect(p.type).toBe('a1.b+c-d');
  });

  it('rejects type starting with a digit', () => {
    expect(() => PackageURL.parse('pkg:3npm/foo')).toThrow();
  });

  it('rejects type with invalid characters', () => {
    expect(() => PackageURL.parse('pkg:n&m/foo')).toThrow();
    expect(() => PackageURL.parse('pkg:n m/foo')).toThrow();
    expect(() => PackageURL.parse('pkg:n;m/foo')).toThrow();
  });

  it('rejects type with colon', () => {
    expect(() => PackageURL.parse('pkg:a:b/foo')).toThrow();
  });

  it('rejects empty type (pkg:/foo — type slot is empty)', () => {
    // After stripping leading /, remainder starts with / → split gives empty type
    expect(() => PackageURL.parse('pkg:/@1.0')).toThrow();
  });

  it('rejects missing slash after type', () => {
    expect(() => PackageURL.parse('pkg:npm')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. PARSING ALGORITHM — Version
// ---------------------------------------------------------------------------
describe('parse: version', () => {
  it('extracts version after rightmost @', () => {
    const p = PackageURL.parse('pkg:npm/foo@1.0.0');
    expect(p.version).toBe('1.0.0');
  });

  it('percent-decodes version', () => {
    const p = PackageURL.parse('pkg:npm/foo@1.0%2B20230101');
    expect(p.version).toBe('1.0+20230101');
  });

  it('handles no version', () => {
    const p = PackageURL.parse('pkg:npm/foo');
    expect(p.version).toBeNull();
  });

  it('handles version containing special characters', () => {
    const p = PackageURL.parse('pkg:docker/nginx@sha256%3A244fd47e07d10');
    expect(p.version).toBe('sha256:244fd47e07d10');
  });

  it('handles version with @ in it (rightmost wins)', () => {
    // The version is everything after the rightmost @ in the version-bearing part
    const p = PackageURL.parse('pkg:generic/foo@user%40host');
    expect(p.name).toBe('foo');
    expect(p.version).toBe('user@host');
  });

  it('rejects empty name before version (ns/@ver)', () => {
    expect(() => PackageURL.parse('pkg:npm/scope/@1.0')).toThrow(/name/i);
  });
});

// ---------------------------------------------------------------------------
// 4. PARSING ALGORITHM — Name
// ---------------------------------------------------------------------------
describe('parse: name', () => {
  it('extracts name from simple purl', () => {
    expect(PackageURL.parse('pkg:npm/express').name).toBe('express');
  });

  it('percent-decodes name', () => {
    const p = PackageURL.parse('pkg:npm/%40angular/core');
    expect(p.namespace).toBe('@angular');
    expect(p.name).toBe('core');
  });

  it('strips trailing slashes before name extraction', () => {
    const p = PackageURL.parse('pkg:npm/express/');
    expect(p.name).toBe('express');
  });

  it('strips multiple trailing slashes', () => {
    const p = PackageURL.parse('pkg:npm/express///');
    expect(p.name).toBe('express');
  });

  it('rejects empty name', () => {
    expect(() => PackageURL.parse('pkg:maven/@1.3.4')).toThrow();
  });

  it('rejects name that is only slashes', () => {
    expect(() => PackageURL.parse('pkg:npm//')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. PARSING ALGORITHM — Namespace
// ---------------------------------------------------------------------------
describe('parse: namespace', () => {
  it('extracts single-segment namespace', () => {
    const p = PackageURL.parse('pkg:maven/org.apache/commons@1.0');
    expect(p.namespace).toBe('org.apache');
    expect(p.name).toBe('commons');
  });

  it('extracts multi-segment namespace', () => {
    const p = PackageURL.parse('pkg:golang/google.golang.org/genproto');
    expect(p.namespace).toBe('google.golang.org');
    expect(p.name).toBe('genproto');
  });

  it('discards empty namespace segments', () => {
    const p = PackageURL.parse('pkg:maven/org.apache//commons@1.0');
    expect(p.namespace).toBe('org.apache');
  });

  it('percent-decodes namespace segments', () => {
    const p = PackageURL.parse('pkg:npm/%40scope/name');
    expect(p.namespace).toBe('@scope');
  });

  it('returns null when no namespace', () => {
    const p = PackageURL.parse('pkg:npm/express@1.0');
    expect(p.namespace).toBeNull();
  });

  it('rejects encoded / (%2F) in namespace segment', () => {
    expect(() => PackageURL.parse('pkg:maven/org%2Fapache/commons')).toThrow(/segment/);
  });
});

// ---------------------------------------------------------------------------
// 6. PARSING ALGORITHM — Qualifiers
// ---------------------------------------------------------------------------
describe('parse: qualifiers', () => {
  it('parses single qualifier', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(p.qualifiers).toEqual({ arch: 'x86' });
  });

  it('parses multiple qualifiers', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86&os=linux');
    expect(p.qualifiers).toEqual({ arch: 'x86', os: 'linux' });
  });

  it('lowercases qualifier keys', () => {
    const p = PackageURL.parse('pkg:npm/foo?Arch=x86&OS=linux');
    expect(p.qualifiers).toEqual({ arch: 'x86', os: 'linux' });
  });

  it('percent-decodes qualifier values', () => {
    const p = PackageURL.parse('pkg:npm/foo?url=https%3A%2F%2Fexample.com');
    expect(p.qualifiers).toEqual({ url: 'https://example.com' });
  });

  it('discards qualifiers with empty values', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=&os=linux');
    expect(p.qualifiers).toEqual({ os: 'linux' });
  });

  it('returns null when all qualifier values are empty', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=&os=');
    expect(p.qualifiers).toBeNull();
  });

  it('returns null when no qualifiers', () => {
    expect(PackageURL.parse('pkg:npm/foo').qualifiers).toBeNull();
  });

  it('handles qualifier with = in value (split on first =)', () => {
    const p = PackageURL.parse('pkg:npm/foo?url=key%3Dvalue');
    expect(p.qualifiers?.url).toBe('key=value');
  });

  it('skips qualifier pairs without =', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86&bogus&os=linux');
    expect(p.qualifiers).toEqual({ arch: 'x86', os: 'linux' });
  });

  it('rejects invalid qualifier key (starts with digit)', () => {
    expect(() => PackageURL.parse('pkg:npm/foo?1key=val')).toThrow();
  });

  it('rejects invalid qualifier key (contains space)', () => {
    expect(() => PackageURL.parse('pkg:npm/foo?in%20production=true')).toThrow();
  });

  it('rejects duplicate qualifier keys', () => {
    expect(() => PackageURL.parse('pkg:npm/foo?arch=x86&arch=arm64')).toThrow(/duplicate/);
  });

  it('handles checksum with comma-separated values', () => {
    const p = PackageURL.parse(
      'pkg:generic/openssl@1.0?checksum=sha1:abc%2Csha256:def'
    );
    expect(p.qualifiers?.checksum).toBe('sha1:abc,sha256:def');
  });

  it('roundtrips checksum with %2C encoding', () => {
    const p = PackageURL.parse(
      'pkg:generic/openssl@1.0?checksum=sha1:abc%2Csha256:def'
    );
    expect(p.toString()).toBe(
      'pkg:generic/openssl@1.0?checksum=sha1:abc%2Csha256:def'
    );
  });
});

// ---------------------------------------------------------------------------
// 7. PARSING ALGORITHM — Subpath
// ---------------------------------------------------------------------------
describe('parse: subpath', () => {
  it('extracts subpath', () => {
    const p = PackageURL.parse('pkg:npm/foo#src/main');
    expect(p.subpath).toBe('src/main');
  });

  it('percent-decodes subpath segments', () => {
    const p = PackageURL.parse('pkg:npm/foo#src/my%20file');
    expect(p.subpath).toBe('src/my file');
  });

  it('discards empty segments', () => {
    const p = PackageURL.parse('pkg:npm/foo#/src//main/');
    expect(p.subpath).toBe('src/main');
  });

  it('discards . segments', () => {
    const p = PackageURL.parse('pkg:npm/foo#./src/./main');
    expect(p.subpath).toBe('src/main');
  });

  it('discards .. segments', () => {
    const p = PackageURL.parse('pkg:npm/foo#src/../main');
    expect(p.subpath).toBe('src/main');
  });

  it('returns null when subpath is only . and .. and empty', () => {
    const p = PackageURL.parse('pkg:npm/foo#/../.');
    expect(p.subpath).toBeNull();
  });

  it('returns null when no subpath', () => {
    expect(PackageURL.parse('pkg:npm/foo').subpath).toBeNull();
  });

  it('rejects encoded / (%2F) in subpath segment', () => {
    expect(() => PackageURL.parse('pkg:npm/foo#src%2Fmain')).toThrow(/subpath segment/);
  });

  it('handles subpath with special characters', () => {
    const p = PackageURL.parse('pkg:npm/foo#NSData%2Bzlib');
    expect(p.subpath).toBe('NSData+zlib');
  });
});

// ---------------------------------------------------------------------------
// 8. BUILDING ALGORITHM — toString() canonical form
// ---------------------------------------------------------------------------
describe('build: toString canonical form', () => {
  it('produces pkg:<type>/<name>', () => {
    const p = new PackageURL('npm', null, 'foo', null, null, null);
    expect(p.toString()).toBe('pkg:npm/foo');
  });

  it('includes namespace with /', () => {
    const p = new PackageURL('maven', 'org.apache', 'commons', null, null, null);
    expect(p.toString()).toBe('pkg:maven/org.apache/commons');
  });

  it('percent-encodes namespace segments', () => {
    const p = new PackageURL('npm', '@angular', 'core', null, null, null);
    expect(p.toString()).toBe('pkg:npm/%40angular/core');
  });

  it('includes version with @', () => {
    const p = new PackageURL('npm', null, 'foo', '1.0.0', null, null);
    expect(p.toString()).toBe('pkg:npm/foo@1.0.0');
  });

  it('percent-encodes version', () => {
    const p = new PackageURL('generic', null, 'foo', 'a b', null, null);
    expect(p.toString()).toContain('@a%20b');
  });

  it('sorts qualifiers lexicographically', () => {
    const p = new PackageURL('npm', null, 'foo', null, { z: '1', a: '2', m: '3' }, null);
    expect(p.toString()).toBe('pkg:npm/foo?a=2&m=3&z=1');
  });

  it('percent-encodes qualifier values', () => {
    const p = new PackageURL('npm', null, 'foo', null, { url: 'https://x.com' }, null);
    expect(p.toString()).toContain('url=https:%2F%2Fx.com');
  });

  it('omits qualifiers with empty values', () => {
    const p = new PackageURL('npm', null, 'foo', null, { arch: '' }, null);
    expect(p.toString()).toBe('pkg:npm/foo');
  });

  it('includes subpath with #', () => {
    const p = new PackageURL('npm', null, 'foo', null, null, 'src/main');
    expect(p.toString()).toBe('pkg:npm/foo#src/main');
  });

  it('filters . and .. from subpath in output', () => {
    const p = new PackageURL('npm', null, 'foo', null, null, 'src/../main/./index');
    expect(p.toString()).toBe('pkg:npm/foo#src/main/index');
  });

  it('lowercases type in output', () => {
    const p = new PackageURL('NPM', null, 'foo', null, null, null);
    expect(p.toString().startsWith('pkg:npm/')).toBe(true);
  });

  it('lowercases qualifier keys in output', () => {
    const p = new PackageURL('npm', null, 'foo', null, { Arch: 'x86' }, null);
    expect(p.toString()).toContain('arch=x86');
  });

  it('encodes checksum commas as %2C', () => {
    const p = new PackageURL(
      'generic', null, 'foo', '1.0',
      { checksum: 'sha1:abc,sha256:def' }, null
    );
    expect(p.toString()).toContain('checksum=sha1:abc%2Csha256:def');
  });
});

// ---------------------------------------------------------------------------
// 9. PERCENT-ENCODING
// ---------------------------------------------------------------------------
describe('percent-encoding', () => {
  it('does not encode unreserved ASCII (A-Z a-z 0-9 . - _ ~ :)', () => {
    const p = new PackageURL('generic', null, 'a-z.A-Z_0-9~test', '1:0', null, null);
    const s = p.toString();
    expect(s).toBe('pkg:generic/a-z.A-Z_0-9~test@1:0');
  });

  it('uses uppercase hex (%2F not %2f)', () => {
    const p = new PackageURL('npm', '@scope', 'name', null, null, null);
    const s = p.toString();
    expect(s).toContain('%40');
    // Ensure all percent-encoded sequences use uppercase hex digits
    const hexMatches = s.match(/%[0-9A-Fa-f]{2}/g) || [];
    expect(hexMatches.length).toBeGreaterThan(0);
    for (const h of hexMatches) {
      expect(h).toBe(h.toUpperCase());
    }
    // Verify no lowercase hex letters (a-f) appear in percent sequences
    expect(s).not.toMatch(/%[0-9A-Fa-f][a-f]/);
    expect(s).not.toMatch(/%[a-f][0-9A-Fa-f]/);
  });

  it('preserves colons unencoded', () => {
    const p = new PackageURL('generic', null, 'foo', 'sha256:abc123', null, null);
    expect(p.toString()).toBe('pkg:generic/foo@sha256:abc123');
  });

  it('encodes spaces as %20', () => {
    const p = new PackageURL('generic', null, 'foo', null, { desc: 'hello world' }, null);
    expect(p.toString()).toContain('desc=hello%20world');
  });

  it('encodes @ in qualifier values', () => {
    const p = new PackageURL('generic', null, 'foo', null, { email: 'a@b.com' }, null);
    expect(p.toString()).toContain('email=a%40b.com');
  });

  it('roundtrips through parse/toString', () => {
    const inputs = [
      'pkg:npm/%40angular/core@16.2.0',
      'pkg:maven/org.apache.commons/commons-lang3@3.12.0',
      'pkg:docker/library/nginx@latest?arch=amd64',
      'pkg:generic/openssl@1.1.10g?checksum=sha1:abc%2Csha256:def',
      'pkg:github/package-url/purl-spec@244fd47e07d1004#everybody/loves/dogs',
      'pkg:golang/google.golang.org/genproto#googleapis/api/annotations',
    ];
    for (const input of inputs) {
      const p = PackageURL.parse(input);
      expect(p.toString()).toBe(input);
    }
  });

  it('rejects null byte %00 during decode', () => {
    expect(() => PackageURL.parse('pkg:npm/foo%00bar')).toThrow(/null byte/);
  });

  it('rejects malformed percent sequence', () => {
    expect(() => PackageURL.parse('pkg:npm/foo%GG')).toThrow();
  });

  it('rejects incomplete percent sequence', () => {
    expect(() => PackageURL.parse('pkg:npm/foo%2')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 10. CONSTRUCTOR — build from components
// ---------------------------------------------------------------------------
describe('constructor: build from components', () => {
  it('requires type', () => {
    expect(() => new PackageURL('', null, 'foo', null, null, null)).toThrow();
  });

  it('requires name', () => {
    expect(() => new PackageURL('npm', null, '', null, null, null)).toThrow();
  });

  it('rejects null type', () => {
    // @ts-expect-error
    expect(() => new PackageURL(null, null, 'foo', null, null, null)).toThrow();
  });

  it('rejects null name', () => {
    // @ts-expect-error
    expect(() => new PackageURL('npm', null, null, null, null, null)).toThrow();
  });

  it('lowercases type', () => {
    const p = new PackageURL('NPM', null, 'foo', null, null, null);
    expect(p.type).toBe('npm');
  });

  it('validates type characters', () => {
    expect(() => new PackageURL('n&m', null, 'foo', null, null, null)).toThrow(/invalid type/);
    expect(() => new PackageURL('3npm', null, 'foo', null, null, null)).toThrow(/invalid type/);
  });

  it('validates qualifier key format', () => {
    expect(() => new PackageURL('npm', null, 'foo', null, { '1bad': 'val' }, null)).toThrow();
    expect(() => new PackageURL('npm', null, 'foo', null, { 'has space': 'val' }, null)).toThrow();
  });

  it('normalizes null namespace/version/qualifiers/subpath', () => {
    const p = new PackageURL('npm', null, 'foo', null, null, null);
    expect(p.namespace).toBeNull();
    expect(p.version).toBeNull();
    expect(p.qualifiers).toBeNull();
    expect(p.subpath).toBeNull();
  });

  it('normalizes empty string namespace to null', () => {
    const p = new PackageURL('npm', '', 'foo', null, null, null);
    expect(p.namespace).toBeNull();
  });

  it('normalizes empty string version to null', () => {
    const p = new PackageURL('npm', null, 'foo', '', null, null);
    expect(p.version).toBeNull();
  });

  it('normalizes subpath with . and ..', () => {
    const p = new PackageURL('npm', null, 'foo', null, null, 'a/../b/./c');
    expect(p.subpath).toBe('a/b/c');
  });

  it('normalizes empty qualifiers to null', () => {
    const p = new PackageURL('npm', null, 'foo', null, {}, null);
    expect(p.qualifiers).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 11. TYPE-SPECIFIC NORMALIZATION
// ---------------------------------------------------------------------------
describe('type normalization: pypi', () => {
  it('lowercases name', () => {
    expect(PackageURL.parse('pkg:pypi/Django@4.2').name).toBe('django');
  });

  it('replaces underscores with dashes', () => {
    expect(PackageURL.parse('pkg:pypi/my_package@1.0').name).toBe('my-package');
  });

  it('applies both: underscore + lowercase', () => {
    const p = PackageURL.parse('pkg:pypi/My_Package@1.0');
    expect(p.name).toBe('my-package');
    expect(p.toString()).toBe('pkg:pypi/my-package@1.0');
  });

  it('prohibits namespace', () => {
    expect(() => PackageURL.parse('pkg:pypi/scope/foo@1.0')).toThrow(/namespace/);
  });
});

describe('type normalization: npm', () => {
  it('lowercases name', () => {
    expect(PackageURL.parse('pkg:npm/Express@4.0').name).toBe('express');
  });

  it('lowercases namespace', () => {
    const p = PackageURL.parse('pkg:npm/%40Angular/Core@16.0');
    expect(p.namespace).toBe('@angular');
    expect(p.name).toBe('core');
  });

  it('roundtrips scoped package', () => {
    const input = 'pkg:npm/%40angular/core@16.0';
    expect(PackageURL.parse(input).toString()).toBe(input);
  });
});

describe('type normalization: maven', () => {
  it('requires namespace', () => {
    expect(() => new PackageURL('maven', null, 'commons', '1.0', null, null)).toThrow(/namespace/);
  });

  it('preserves case (name is case-sensitive)', () => {
    const p = PackageURL.parse('pkg:maven/org.apache/CommonsLang@3.0');
    expect(p.name).toBe('CommonsLang');
  });
});

describe('type normalization: github', () => {
  it('lowercases namespace and name', () => {
    const p = PackageURL.parse('pkg:github/Package-URL/Purl-Spec@1.0');
    expect(p.namespace).toBe('package-url');
    expect(p.name).toBe('purl-spec');
  });

  it('requires namespace', () => {
    expect(() => new PackageURL('github', null, 'repo', '1.0', null, null)).toThrow(/namespace/);
  });
});

describe('type normalization: bitbucket', () => {
  it('lowercases namespace and name', () => {
    const p = PackageURL.parse('pkg:bitbucket/MyOrg/MyRepo@1.0');
    expect(p.namespace).toBe('myorg');
    expect(p.name).toBe('myrepo');
  });
});

describe('type normalization: docker', () => {
  it('accepts namespace (optional)', () => {
    const p = PackageURL.parse('pkg:docker/library/nginx@latest');
    expect(p.namespace).toBe('library');
    expect(p.name).toBe('nginx');
  });

  it('accepts no namespace', () => {
    const p = PackageURL.parse('pkg:docker/nginx@latest');
    expect(p.namespace).toBeNull();
  });
});

describe('type normalization: huggingface', () => {
  it('lowercases version (commit hash)', () => {
    const p = PackageURL.parse('pkg:huggingface/google/bert-base-uncased@CD5EF3A3');
    expect(p.version).toBe('cd5ef3a3');
  });

  it('preserves name case', () => {
    const p = PackageURL.parse('pkg:huggingface/google/Bert-Base-Uncased@abc');
    expect(p.name).toBe('Bert-Base-Uncased');
  });

  it('requires namespace', () => {
    expect(() => new PackageURL('huggingface', null, 'model', '1.0', null, null)).toThrow(/namespace/);
  });
});

describe('type normalization: golang', () => {
  it('lowercases namespace and name', () => {
    const p = PackageURL.parse('pkg:golang/Google.Golang.Org/GenProto');
    expect(p.namespace).toBe('google.golang.org');
    expect(p.name).toBe('genproto');
  });
});

describe('type normalization: composer', () => {
  it('lowercases namespace and name', () => {
    const p = PackageURL.parse('pkg:composer/Laravel/Framework@10.0');
    expect(p.namespace).toBe('laravel');
    expect(p.name).toBe('framework');
  });

  it('requires namespace', () => {
    expect(() => new PackageURL('composer', null, 'foo', '1.0', null, null)).toThrow(/namespace/);
  });
});

describe('type normalization: nuget', () => {
  it('preserves name case (case-sensitive canonical)', () => {
    const p = PackageURL.parse('pkg:nuget/EnterpriseLibrary.Common@6.0');
    expect(p.name).toBe('EnterpriseLibrary.Common');
  });

  it('prohibits namespace', () => {
    expect(() => new PackageURL('nuget', 'ns', 'foo', '1.0', null, null)).toThrow(/namespace/);
  });
});

describe('type normalization: cargo', () => {
  it('preserves name case', () => {
    const p = PackageURL.parse('pkg:cargo/Serde@1.0');
    expect(p.name).toBe('Serde');
  });

  it('prohibits namespace', () => {
    expect(() => new PackageURL('cargo', 'ns', 'foo', null, null, null)).toThrow(/namespace/);
  });
});

describe('type normalization: cpan', () => {
  it('requires namespace', () => {
    expect(() => new PackageURL('cpan', null, 'Foo', '1.0', null, null)).toThrow(/namespace/);
  });

  it('rejects :: in name', () => {
    expect(() => new PackageURL('cpan', 'author', 'Foo::Bar', '1.0', null, null)).toThrow(/::/);
  });
});

describe('type normalization: julia', () => {
  it('requires uuid qualifier', () => {
    expect(() => new PackageURL('julia', null, 'Flux', '0.13', null, null)).toThrow(/uuid/);
  });

  it('accepts with uuid qualifier', () => {
    const p = new PackageURL('julia', null, 'Flux', '0.13', { uuid: '587475ba-b771-5e3f-ad9e-33799f191a9c' }, null);
    expect(p.name).toBe('Flux');
  });
});

describe('type normalization: swid', () => {
  it('requires tag_id qualifier', () => {
    expect(() => new PackageURL('swid', null, 'foo', '1.0', null, null)).toThrow(/tag_id/);
  });

  it('accepts with tag_id qualifier', () => {
    const p = new PackageURL('swid', null, 'foo', '1.0', { tag_id: 'test-id' }, null);
    expect(p.name).toBe('foo');
  });
});

describe('type normalization: vscode-extension', () => {
  it('lowercases namespace, name, and version', () => {
    const p = PackageURL.parse('pkg:vscode-extension/MS-Python/Python@2024.1.ABC');
    expect(p.namespace).toBe('ms-python');
    expect(p.name).toBe('python');
    expect(p.version).toBe('2024.1.abc');
  });

  it('requires namespace', () => {
    expect(() => new PackageURL('vscode-extension', null, 'ext', '1.0', null, null)).toThrow(/namespace/);
  });
});

describe('type normalization: mlflow', () => {
  it('lowercases name when repository_url contains databricks', () => {
    const p = new PackageURL(
      'mlflow', null, 'CreditFraud', '3',
      { repository_url: 'https://adb-123.azuredatabricks.net/api/2.0/mlflow' }, null
    );
    expect(p.name).toBe('creditfraud');
  });

  it('preserves name case for Azure ML (non-databricks)', () => {
    const p = new PackageURL(
      'mlflow', null, 'CreditFraud', '3',
      { repository_url: 'https://westus2.api.azureml.ms/mlflow/v1.0' }, null
    );
    expect(p.name).toBe('CreditFraud');
  });

  it('preserves name case when no repository_url', () => {
    const p = new PackageURL('mlflow', null, 'MyModel', '1', null, null);
    expect(p.name).toBe('MyModel');
  });
});

// ---------------------------------------------------------------------------
// 12. NAMESPACE ENFORCEMENT — all types
// ---------------------------------------------------------------------------
describe('namespace enforcement', () => {
  const requiredNs = [
    'alpm', 'apk', 'bitbucket', 'composer', 'cpan', 'deb', 'github',
    'golang', 'huggingface', 'maven', 'rpm', 'swift', 'vscode-extension', 'yocto',
  ];
  const prohibitedNs = [
    'bazel', 'bitnami', 'cargo', 'cran', 'julia', 'mlflow', 'nuget', 'oci', 'otp', 'pypi',
  ];

  for (const t of requiredNs) {
    it(`${t}: rejects missing namespace`, () => {
      const extra: Record<string, string> = {};
      if (t === 'julia') extra.uuid = 'test-uuid';
      if (t === 'swid') extra.tag_id = 'test';
      expect(() => new PackageURL(t, null, 'foo', '1.0', Object.keys(extra).length ? extra : null, null)).toThrow(/namespace/);
    });
  }

  for (const t of prohibitedNs) {
    it(`${t}: rejects namespace when prohibited`, () => {
      const extra: Record<string, string> = {};
      if (t === 'julia') extra.uuid = 'test-uuid';
      expect(() => new PackageURL(t, 'ns', 'foo', '1.0', Object.keys(extra).length ? extra : null, null)).toThrow(/namespace/);
    });
  }
});

// ---------------------------------------------------------------------------
// 13. TYPE REGISTRY
// ---------------------------------------------------------------------------
describe('type registry', () => {
  it('has 38 registered types', () => {
    expect(registeredTypes().length).toBe(38);
  });

  it('returns types sorted alphabetically', () => {
    const types = registeredTypes();
    const sorted = [...types].sort();
    expect(types).toEqual(sorted);
  });

  it('lookupType returns correct definition', () => {
    const npm = lookupType('npm');
    expect(npm).toBeDefined();
    expect(npm!.type).toBe('npm');
    expect(npm!.namespace.requirement).toBe('optional');
    expect(npm!.namespace.caseSensitive).toBe(false);
    expect(npm!.name.caseSensitive).toBe(false);
  });

  it('lookupType is case-insensitive', () => {
    expect(lookupType('NPM')).toBeDefined();
    expect(lookupType('Npm')).toBeDefined();
    expect(lookupType('npm')!.type).toBe(lookupType('NPM')!.type);
  });

  it('lookupType returns undefined for unknown type', () => {
    expect(lookupType('nonexistent')).toBeUndefined();
  });

  it('lookupType returns frozen objects', () => {
    const def = lookupType('npm')!;
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.namespace)).toBe(true);
    expect(Object.isFrozen(def.name)).toBe(true);
  });

  it('registerType rejects overriding built-in types', () => {
    expect(() =>
      registerType({
        type: 'npm', typeName: 'x', description: 'x',
        repository: { useRepository: false },
        namespace: { requirement: 'optional', caseSensitive: true },
        name: { requirement: 'required', caseSensitive: true },
        version: { requirement: 'optional', caseSensitive: true },
        examples: [],
      })
    ).toThrow(/cannot override/);
  });

  it('registerType allows custom types', () => {
    registerType({
      type: 'ecma427-test-custom', typeName: 'Custom', description: 'test',
      repository: { useRepository: false },
      namespace: { requirement: 'optional', caseSensitive: true },
      name: { requirement: 'required', caseSensitive: true },
      version: { requirement: 'optional', caseSensitive: true },
      examples: [],
    });
    expect(lookupType('ecma427-test-custom')).toBeDefined();
  });

  it('custom types work in parse and build', () => {
    // Relies on 'ecma427-test-custom' registered above
    const p = PackageURL.parse('pkg:ecma427-test-custom/myns/myname@1.0');
    expect(p.type).toBe('ecma427-test-custom');
    expect(p.namespace).toBe('myns');
    expect(p.name).toBe('myname');
    expect(p.version).toBe('1.0');
  });
});

// ---------------------------------------------------------------------------
// 14. API CONTRACTS — equals, matchesBase, withVersion, withQualifiers
// ---------------------------------------------------------------------------
describe('API: equals()', () => {
  it('equal after normalization', () => {
    const a = PackageURL.parse('pkg:pypi/Django@4.2');
    const b = PackageURL.parse('pkg:pypi/django@4.2');
    expect(a.equals(b)).toBe(true);
  });

  it('not equal with different version', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0');
    const b = PackageURL.parse('pkg:npm/foo@2.0');
    expect(a.equals(b)).toBe(false);
  });

  it('not equal with different qualifiers', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0?arch=x86');
    const b = PackageURL.parse('pkg:npm/foo@1.0?arch=arm');
    expect(a.equals(b)).toBe(false);
  });

  it('not equal with different subpath', () => {
    const a = PackageURL.parse('pkg:npm/foo#src');
    const b = PackageURL.parse('pkg:npm/foo#lib');
    expect(a.equals(b)).toBe(false);
  });

  it('equal when both have no optional components', () => {
    const a = PackageURL.parse('pkg:npm/foo');
    const b = PackageURL.parse('pkg:npm/foo');
    expect(a.equals(b)).toBe(true);
  });
});

describe('API: matchesBase()', () => {
  it('matches same package different versions', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0');
    const b = PackageURL.parse('pkg:npm/foo@2.0');
    expect(a.matchesBase(b)).toBe(true);
  });

  it('matches ignoring qualifiers', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0?arch=x86');
    const b = PackageURL.parse('pkg:npm/foo@1.0');
    expect(a.matchesBase(b)).toBe(true);
  });

  it('matches ignoring subpath', () => {
    const a = PackageURL.parse('pkg:npm/foo#src');
    const b = PackageURL.parse('pkg:npm/foo#lib');
    expect(a.matchesBase(b)).toBe(true);
  });

  it('does not match different type', () => {
    const a = PackageURL.parse('pkg:npm/foo');
    const b = PackageURL.parse('pkg:cargo/foo');
    expect(a.matchesBase(b)).toBe(false);
  });

  it('does not match different name', () => {
    const a = PackageURL.parse('pkg:npm/foo');
    const b = PackageURL.parse('pkg:npm/bar');
    expect(a.matchesBase(b)).toBe(false);
  });

  it('does not match different namespace', () => {
    const a = PackageURL.parse('pkg:maven/org.a/foo');
    const b = PackageURL.parse('pkg:maven/org.b/foo');
    expect(a.matchesBase(b)).toBe(false);
  });
});

describe('API: withVersion()', () => {
  it('returns new instance with updated version', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0');
    const b = a.withVersion('2.0');
    expect(b.version).toBe('2.0');
    expect(a.version).toBe('1.0'); // original unchanged
  });

  it('preserves other components', () => {
    const a = PackageURL.parse('pkg:npm/%40scope/foo@1.0?arch=x86#src');
    const b = a.withVersion('2.0');
    expect(b.type).toBe('npm');
    expect(b.namespace).toBe('@scope');
    expect(b.name).toBe('foo');
    expect(b.qualifiers).toEqual({ arch: 'x86' });
    expect(b.subpath).toBe('src');
  });

  it('rejects empty version string', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0');
    expect(() => a.withVersion('')).toThrow();
  });
});

describe('API: withoutVersion()', () => {
  it('returns new instance without version', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0');
    const b = a.withoutVersion();
    expect(b.version).toBeNull();
    expect(b.toString()).toBe('pkg:npm/foo');
  });
});

describe('API: withQualifiers()', () => {
  it('returns new instance with replaced qualifiers', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0?arch=x86');
    const b = a.withQualifiers({ os: 'linux' });
    expect(b.qualifiers).toEqual({ os: 'linux' });
  });

  it('preserves other components', () => {
    const a = PackageURL.parse('pkg:npm/foo@1.0?arch=x86');
    const b = a.withQualifiers({ os: 'linux' });
    expect(b.version).toBe('1.0');
    expect(b.name).toBe('foo');
  });
});

describe('API: getQualifier()', () => {
  it('returns qualifier value', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(p.getQualifier('arch')).toBe('x86');
  });

  it('returns undefined for missing key', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(p.getQualifier('os')).toBeUndefined();
  });

  it('returns undefined when no qualifiers', () => {
    const p = PackageURL.parse('pkg:npm/foo');
    expect(p.getQualifier('arch')).toBeUndefined();
  });

  it('does not leak prototype properties', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(p.getQualifier('constructor')).toBeUndefined();
    expect(p.getQualifier('__proto__')).toBeUndefined();
    expect(p.getQualifier('toString')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 15. API CONTRACTS — validate, validateString, isValid, tryParse
// ---------------------------------------------------------------------------
describe('API: validate()', () => {
  it('returns null for valid purl', () => {
    const p = PackageURL.parse('pkg:npm/foo@1.0');
    expect(p.validate()).toBeNull();
  });

  it('catches invalid state on manually constructed object', () => {
    const fake = Object.create(PackageURL.prototype);
    Object.assign(fake, {
      type: 'NPM', name: 'foo', namespace: null,
      version: null, qualifiers: null, subpath: null,
    });
    const err = fake.validate();
    expect(err).not.toBeNull();
    expect(err!.errors.some((e: any) => e.field === 'type')).toBe(true);
  });

  it('validates type-specific rules', () => {
    const fake = Object.create(PackageURL.prototype);
    Object.assign(fake, {
      type: 'maven', name: 'foo', namespace: null,
      version: null, qualifiers: null, subpath: null,
    });
    const err = fake.validate();
    expect(err).not.toBeNull();
    expect(err!.errors.some((e: any) => e.field === 'namespace')).toBe(true);
  });
});

describe('API: validateString()', () => {
  it('returns null for valid purl string', () => {
    expect(validateString('pkg:npm/foo@1.0')).toBeNull();
  });

  it('returns ValidationError for invalid string', () => {
    const err = validateString('not-a-purl');
    expect(err).not.toBeNull();
    expect(err!.errors.length).toBeGreaterThan(0);
  });

  it('returns ValidationError for type-specific violations', () => {
    // Julia without uuid — parse will throw, so validateString wraps it
    const err = validateString('pkg:julia/Flux@0.13');
    expect(err).not.toBeNull();
  });
});

describe('API: isValid()', () => {
  it('returns true for valid purl', () => {
    expect(isValid('pkg:npm/foo@1.0')).toBe(true);
  });

  it('returns false for invalid purl', () => {
    expect(isValid('not-a-purl')).toBe(false);
  });

  it('returns false for type-specific violations', () => {
    expect(isValid('pkg:julia/Flux@0.13')).toBe(false);
  });
});

describe('API: tryParse()', () => {
  it('returns PackageURL for valid input', () => {
    const p = tryParse('pkg:npm/foo@1.0');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('foo');
  });

  it('returns null for invalid input', () => {
    expect(tryParse('not-a-purl')).toBeNull();
    expect(tryParse('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 16. IMMUTABILITY
// ---------------------------------------------------------------------------
describe('immutability', () => {
  it('qualifiers from parse are frozen', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(Object.isFrozen(p.qualifiers)).toBe(true);
    expect(() => { (p.qualifiers as any).evil = 'x'; }).toThrow();
  });

  it('qualifiers from constructor are frozen', () => {
    const p = new PackageURL('npm', null, 'foo', null, { arch: 'x86' }, null);
    expect(Object.isFrozen(p.qualifiers)).toBe(true);
    expect(() => { (p.qualifiers as any).evil = 'x'; }).toThrow();
  });

  it('qualifier object has null prototype', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(Object.getPrototypeOf(p.qualifiers)).toBeNull();
  });

  it('type registry definitions are frozen', () => {
    const def = lookupType('npm')!;
    expect(() => { (def as any).type = 'hacked'; }).toThrow();
    expect(() => { (def.namespace as any).requirement = 'prohibited'; }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 17. EDGE CASES & CORNER CASES
// ---------------------------------------------------------------------------
describe('edge cases', () => {
  it('purl with all components', () => {
    const p = PackageURL.parse(
      'pkg:maven/org.apache.commons/commons-lang3@3.12.0?classifier=sources#src/main'
    );
    expect(p.type).toBe('maven');
    expect(p.namespace).toBe('org.apache.commons');
    expect(p.name).toBe('commons-lang3');
    expect(p.version).toBe('3.12.0');
    expect(p.qualifiers).toEqual({ classifier: 'sources' });
    expect(p.subpath).toBe('src/main');
  });

  it('purl with only type and name', () => {
    const p = PackageURL.parse('pkg:npm/express');
    expect(p.type).toBe('npm');
    expect(p.name).toBe('express');
    expect(p.namespace).toBeNull();
    expect(p.version).toBeNull();
    expect(p.qualifiers).toBeNull();
    expect(p.subpath).toBeNull();
  });

  it('version containing @ character', () => {
    // The rightmost @ wins for splitting
    const p = PackageURL.parse('pkg:generic/foo@a%40b');
    expect(p.version).toBe('a@b');
  });

  it('name with encoded special characters', () => {
    const p = PackageURL.parse('pkg:npm/%40scope/my%2Bpackage');
    expect(p.namespace).toBe('@scope');
    expect(p.name).toBe('my+package');
  });

  it('qualifier value with equals sign', () => {
    const p = PackageURL.parse('pkg:npm/foo?data=key%3Dvalue');
    expect(p.qualifiers?.data).toBe('key=value');
  });

  it('multiple qualifiers sorted in output', () => {
    const p = PackageURL.parse('pkg:npm/foo?z=1&a=2&m=3');
    expect(p.toString()).toBe('pkg:npm/foo?a=2&m=3&z=1');
  });

  it('unknown type passes through without normalization', () => {
    const p = PackageURL.parse('pkg:unknowntype/ns/name@1.0');
    expect(p.type).toBe('unknowntype');
    expect(p.namespace).toBe('ns');
    expect(p.name).toBe('name');
  });

  it('very long valid purl (under limit)', () => {
    const name = 'a'.repeat(2000);
    const p = PackageURL.parse(`pkg:npm/${name}@1.0`);
    expect(p.name).toBe(name);
  });

  it('rejects purl exceeding maximum length', () => {
    const huge = 'pkg:npm/' + 'a'.repeat(70000);
    expect(() => PackageURL.parse(huge)).toThrow(/maximum length/);
  });

  it('handles colon in subpath (bazel target reference)', () => {
    const p = PackageURL.parse('pkg:bazel/rules_java@8.5.0#java/runfiles:runfiles');
    expect(p.subpath).toBe('java/runfiles:runfiles');
  });

  it('handles + in subpath (cocoapods)', () => {
    const p = PackageURL.parse('pkg:cocoapods/GoogleUtilities@7.5.2#NSData%2Bzlib');
    expect(p.subpath).toBe('NSData+zlib');
    expect(p.toString()).toBe('pkg:cocoapods/GoogleUtilities@7.5.2#NSData%2Bzlib');
  });

  it('docker image with sha256 version', () => {
    const p = PackageURL.parse(
      'pkg:docker/customer/dockerimage@sha256%3A244fd47e07d10?repository_url=gcr.io'
    );
    expect(p.version).toBe('sha256:244fd47e07d10');
    expect(p.qualifiers?.repository_url).toBe('gcr.io');
  });

  it('golang purl with subpath and leading/trailing slashes', () => {
    const p = PackageURL.parse('pkg:golang/google.golang.org/genproto#/googleapis/api/annotations/');
    expect(p.subpath).toBe('googleapis/api/annotations');
  });
});
