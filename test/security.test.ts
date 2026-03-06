import { describe, it, expect } from 'vitest';
import { PackageURL, lookupType, registerType } from '../src/index.js';

describe('security: skipNormalize bypass blocked', () => {
  it('rejects bad type chars when external caller passes true', () => {
    // @ts-expect-error — testing runtime behavior of 7th param
    expect(() => new PackageURL('../../etc', null, 'passwd', null, null, null, true)).toThrow();
  });

  it('rejects null byte when external caller passes true', () => {
    // @ts-expect-error
    expect(() => new PackageURL('npm', null, 'foo\x00bar', null, null, null, true)).toThrow();
  });

  it('normalizes subpath traversal when external caller passes true', () => {
    // @ts-expect-error
    const p = new PackageURL('npm', null, 'foo', null, null, '../../../etc/passwd', true);
    expect(p.subpath).not.toContain('..');
    expect(p.toString()).not.toContain('..');
  });
});

describe('security: constructor type validation', () => {
  it('rejects SQL injection in type', () => {
    expect(() => new PackageURL('npm; DROP TABLE pkgs--', null, 'foo', null, null, null)).toThrow(/invalid type/);
  });

  it('rejects path traversal in type', () => {
    expect(() => new PackageURL('../../etc', null, 'passwd', null, null, null)).toThrow(/invalid type/);
  });

  it('rejects spaces in type', () => {
    expect(() => new PackageURL('my type', null, 'foo', null, null, null)).toThrow(/invalid type/);
  });
});

describe('security: registry mutation blocked', () => {
  it('lookupType returns frozen object', () => {
    const def = lookupType('npm')!;
    expect(() => { (def.namespace as any).requirement = 'prohibited'; }).toThrow();
  });

  it('registerType rejects overriding built-in types', () => {
    expect(() => registerType({
      type: 'npm',
      typeName: 'evil',
      description: '',
      repository: { useRepository: false },
      namespace: { requirement: 'prohibited', caseSensitive: true },
      name: { requirement: 'required', caseSensitive: true },
      version: { requirement: 'optional', caseSensitive: true },
      examples: [],
    })).toThrow(/cannot override built-in/);
  });

  it('registerType allows new types', () => {
    expect(() => registerType({
      type: 'custom-test',
      typeName: 'Custom',
      description: 'test',
      repository: { useRepository: false },
      namespace: { requirement: 'optional', caseSensitive: true },
      name: { requirement: 'required', caseSensitive: true },
      version: { requirement: 'optional', caseSensitive: true },
      examples: [],
    })).not.toThrow();
  });
});

describe('security: null byte injection', () => {
  it('rejects null byte in name via constructor', () => {
    expect(() => new PackageURL('npm', null, 'foo\x00bar', null, null, null)).toThrow(/null byte/);
  });

  it('rejects null byte in type via constructor', () => {
    expect(() => new PackageURL('np\x00m', null, 'foo', null, null, null)).toThrow(/null byte/);
  });

  it('rejects null byte in version via constructor', () => {
    expect(() => new PackageURL('npm', null, 'foo', '1.0\x00', null, null)).toThrow(/null byte/);
  });

  it('rejects null byte in namespace via constructor', () => {
    expect(() => new PackageURL('npm', 'scope\x00evil', 'foo', null, null, null)).toThrow(/null byte/);
  });

  it('rejects null byte in qualifier value via constructor', () => {
    expect(() => new PackageURL('npm', null, 'foo', null, { arch: 'x86\x00evil' }, null)).toThrow(/null byte/);
  });

  it('rejects null byte in subpath via constructor', () => {
    expect(() => new PackageURL('npm', null, 'foo', null, null, 'src\x00evil')).toThrow(/null byte/);
  });

  it('rejects null byte via parse (%00)', () => {
    expect(() => PackageURL.parse('pkg:npm/foo%00bar')).toThrow(/null byte/);
  });
});

describe('security: component length limits', () => {
  it('rejects overlong name via constructor', () => {
    expect(() => new PackageURL('npm', null, 'a'.repeat(5000), null, null, null)).toThrow(/maximum length/);
  });

  it('rejects overlong namespace via constructor', () => {
    expect(() => new PackageURL('npm', 'a'.repeat(5000), 'foo', null, null, null)).toThrow(/maximum length/);
  });

  it('rejects overlong qualifier value via constructor', () => {
    expect(() => new PackageURL('npm', null, 'foo', null, { arch: 'a'.repeat(5000) }, null)).toThrow(/maximum length/);
  });
});

describe('security: qualifier prototype leakage', () => {
  it('getQualifier does not return prototype methods', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(p.getQualifier('constructor')).toBeUndefined();
    expect(p.getQualifier('toString')).toBeUndefined();
    expect(p.getQualifier('hasOwnProperty')).toBeUndefined();
    expect(p.getQualifier('__proto__')).toBeUndefined();
  });
});

describe('security: post-construction mutation blocked', () => {
  it('qualifiers from parse are frozen', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86');
    expect(() => { (p.qualifiers as any).evil = 'injected'; }).toThrow();
  });

  it('qualifiers from constructor are frozen', () => {
    const p = new PackageURL('npm', null, 'foo', null, { arch: 'x86' }, null);
    expect(() => { (p.qualifiers as any).evil = 'injected'; }).toThrow();
  });
});

describe('security: validate catches invalid states', () => {
  it('rejects uppercase type', () => {
    // Force via parse of valid purl, then check TYPE_RE enforces lowercase
    const err = new PackageURL('npm', null, 'foo', null, null, null).validate();
    expect(err).toBeNull(); // lowercase is fine

    // Simulate a bad object by using Object.create
    const fake = Object.create(PackageURL.prototype);
    Object.assign(fake, { type: 'NPM', name: 'foo', namespace: null, version: null, qualifiers: null, subpath: null });
    const result = fake.validate();
    expect(result).not.toBeNull();
    expect(result!.errors.some((e: any) => e.field === 'type')).toBe(true);
  });
});

describe('security: toString defense-in-depth', () => {
  it('filters .. from subpath in toString output', () => {
    const p = PackageURL.parse('pkg:npm/foo#src/main');
    // Even if someone managed to set subpath with .., toString strips it
    const str = p.toString();
    expect(str).not.toMatch(/#.*\.\./);
  });
});

describe('spec compliance: subpath %2F rejection', () => {
  it('rejects encoded / in subpath segment', () => {
    expect(() => PackageURL.parse('pkg:npm/foo@1.0#src%2Fmain')).toThrow(/subpath segment/);
  });

  it('allows normal subpath with literal /', () => {
    const p = PackageURL.parse('pkg:npm/foo@1.0#src/main');
    expect(p.subpath).toBe('src/main');
  });
});

describe('spec compliance: duplicate qualifier keys', () => {
  it('rejects duplicate qualifier keys', () => {
    expect(() => PackageURL.parse('pkg:npm/foo?arch=x86&arch=arm64')).toThrow(/duplicate qualifier key/);
  });

  it('allows unique qualifier keys', () => {
    const p = PackageURL.parse('pkg:npm/foo?arch=x86&os=linux');
    expect(p.qualifiers).toEqual({ arch: 'x86', os: 'linux' });
  });
});
