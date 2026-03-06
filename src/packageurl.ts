import { percentEncode, percentDecode } from './encode.js';
import { lookupType } from './types.js';
import { validate, ValidationError } from './validate.js';
import type { FieldError } from './validate.js';

export type Qualifiers = Record<string, string>;

/** Maximum accepted PURL string length to prevent denial-of-service. */
const MAX_PURL_LENGTH = 65536;

/** Maximum length for any single component to prevent DoS via constructor. */
const MAX_COMPONENT_LENGTH = 4096;

/** Maximum number of qualifier pairs to prevent hash-flooding DoS. */
const MAX_QUALIFIERS = 128;

const QUALIFIER_KEY_RE = /^[a-z][a-z0-9._-]*$/;
const TYPE_RE = /^[a-zA-Z][a-zA-Z0-9.+-]*$/;

/**
 * Module-private token. Only code in this module can construct with skipNormalize.
 * External callers passing `true` or any other value for the 7th parameter
 * will hit the full validation path.
 */
const INTERNAL = Symbol('PackageURL.internal');

export class PackageURL {
  readonly type: string;
  readonly namespace: string | null;
  readonly name: string;
  readonly version: string | null;
  readonly qualifiers: Qualifiers | null;
  readonly subpath: string | null;

  constructor(
    type: string,
    namespace: string | null,
    name: string,
    version: string | null,
    qualifiers: Qualifiers | null,
    subpath: string | null,
    /** @internal Module-private token — external callers must omit this parameter. */
    _internal?: symbol
  ) {
    if (!type) throw new Error('type is required');
    if (!name) throw new Error('name is required');

    if (_internal === INTERNAL) {
      // Trusted internal path (from parse, which already validated/normalized).
      // Clone qualifiers onto a null-prototype object and freeze.
      this.type = type;
      this.namespace = namespace || null;
      this.name = name;
      this.version = version || null;
      this.qualifiers = qualifiers && Object.keys(qualifiers).length > 0
        ? Object.freeze(qualifiers)
        : null;
      this.subpath = subpath || null;
    } else {
      // Public constructor — full validation and normalization.
      rejectNullBytes(type, 'type');
      if (namespace) rejectNullBytes(namespace, 'namespace');
      rejectNullBytes(name, 'name');
      if (version) rejectNullBytes(version, 'version');
      if (subpath) rejectNullBytes(subpath, 'subpath');

      rejectOverlong(type, 'type');
      if (namespace) rejectOverlong(namespace, 'namespace');
      rejectOverlong(name, 'name');
      if (version) rejectOverlong(version, 'version');
      if (subpath) rejectOverlong(subpath, 'subpath');

      if (!TYPE_RE.test(type)) {
        throw new Error(`invalid type "${truncate(type)}"`);
      }

      this.type = type.toLowerCase();

      // Validate qualifier keys and values
      if (qualifiers) {
        let qCount = 0;
        for (const key of Object.keys(qualifiers)) {
          if (!QUALIFIER_KEY_RE.test(key.toLowerCase())) {
            throw new Error(`invalid qualifier key "${truncate(key)}"`);
          }
          rejectNullBytes(key, 'qualifier key');
          rejectNullBytes(qualifiers[key], 'qualifier value');
          rejectOverlong(key, 'qualifier key');
          rejectOverlong(qualifiers[key], 'qualifier value');
          if (++qCount > MAX_QUALIFIERS) {
            throw new Error(`too many qualifiers (max ${MAX_QUALIFIERS})`);
          }
        }
      }

      this.namespace = normalizeNamespace(this.type, namespace);
      this.name = normalizeName(this.type, name, qualifiers);
      this.version = normalizeVersion(this.type, version);
      this.qualifiers = normalizeQualifiers(qualifiers);
      this.subpath = normalizeSubpath(subpath);

      // Freeze qualifiers to prevent post-construction mutation
      if (this.qualifiers) Object.freeze(this.qualifiers);

      // Type-specific validation for build
      enforceTypeRules(this.type, this.namespace, this.name, this.qualifiers);
    }
  }

  /**
   * Parse a PURL string into a PackageURL.
   * Follows the spec's right-to-left parsing algorithm.
   */
  static parse(purl: string): PackageURL {
    if (!purl || typeof purl !== 'string') {
      throw new Error('purl string is required');
    }
    if (purl.length > MAX_PURL_LENGTH) {
      throw new Error(`purl string exceeds maximum length of ${MAX_PURL_LENGTH}`);
    }

    let remainder = purl;

    // 1. Split on # from right for subpath
    let subpath: string | null = null;
    const hashIdx = remainder.lastIndexOf('#');
    if (hashIdx !== -1) {
      const rawSubpath = remainder.substring(hashIdx + 1);
      remainder = remainder.substring(0, hashIdx);
      subpath = parseSubpath(rawSubpath);
    }

    // 2. Split on ? from right for qualifiers
    let qualifiers: Qualifiers | null = null;
    const qIdx = remainder.lastIndexOf('?');
    if (qIdx !== -1) {
      const rawQualifiers = remainder.substring(qIdx + 1);
      remainder = remainder.substring(0, qIdx);
      qualifiers = parseQualifiers(rawQualifiers);
    }

    // 3. Split on : from left for scheme
    const colonIdx = remainder.indexOf(':');
    if (colonIdx === -1) {
      throw new Error('missing scheme: purl must start with "pkg:"');
    }
    const scheme = remainder.substring(0, colonIdx).toLowerCase();
    if (scheme !== 'pkg') {
      throw new Error(`invalid scheme "${truncate(scheme)}", expected "pkg"`);
    }
    remainder = remainder.substring(colonIdx + 1);

    // 4. Strip leading slashes (pkg:/ pkg:// pkg:/// are all valid) — single substring, no loop
    let leadSlash = 0;
    while (leadSlash < remainder.length && remainder.charCodeAt(leadSlash) === 0x2f) leadSlash++;
    if (leadSlash > 0) remainder = remainder.substring(leadSlash);

    // 5. Split on first / for type
    const slashIdx = remainder.indexOf('/');
    if (slashIdx === -1) {
      throw new Error('missing name: type must be followed by "/" and a name');
    }
    const type = remainder.substring(0, slashIdx).toLowerCase();
    remainder = remainder.substring(slashIdx + 1);

    // Validate type characters
    if (!type || !/^[a-zA-Z][a-zA-Z0-9.+-]*$/.test(type)) {
      throw new Error(`invalid type "${truncate(type)}"`);
    }

    // 6. Split from right on @ for version
    let version: string | null = null;
    const atIdx = remainder.lastIndexOf('@');
    if (atIdx > 0) {
      version = percentDecode(remainder.substring(atIdx + 1));
      remainder = remainder.substring(0, atIdx);
      // If remainder ends with /, name slot was empty (e.g. "ns/@ver")
      if (remainder.endsWith('/')) {
        throw new Error('name is required and cannot be empty');
      }
    } else if (atIdx === 0) {
      // @ at position 0: check if right side contains /
      // If no /, it's a version separator with empty name → error
      // If yes, @ is data (like npm @scope)
      const rightOfAt = remainder.substring(1);
      if (!rightOfAt.includes('/')) {
        throw new Error('name is required and cannot be empty');
      }
      // Don't split — @ is part of data
    }

    // 7. Strip trailing slashes, then split from right on / for name — single substring, no loop
    let trailSlash = remainder.length;
    while (trailSlash > 0 && remainder.charCodeAt(trailSlash - 1) === 0x2f) trailSlash--;
    if (trailSlash < remainder.length) remainder = remainder.substring(0, trailSlash);

    const lastSlashIdx = remainder.lastIndexOf('/');
    let name: string;
    let namespace: string | null;

    if (lastSlashIdx === -1) {
      name = percentDecode(remainder);
      namespace = null;
    } else {
      name = percentDecode(remainder.substring(lastSlashIdx + 1));
      const rawNamespace = remainder.substring(0, lastSlashIdx);
      // 8. Parse namespace segments — decode each, but reject decoded '/' inside
      //    a segment since it would corrupt segment boundaries on roundtrip.
      const segments: string[] = [];
      for (const raw of rawNamespace.split('/')) {
        if (raw === '') continue;
        const decoded = percentDecode(raw);
        if (decoded.includes('/')) {
          throw new Error(
            `namespace segment "${truncate(raw)}" decodes to a value containing "/", which would corrupt segment boundaries`
          );
        }
        segments.push(decoded);
      }
      namespace = segments.length > 0 ? segments.join('/') : null;
    }

    if (!name) {
      throw new Error('name is required and cannot be empty');
    }

    // Apply type-specific normalization
    const normalizedType = type.toLowerCase();
    const normalizedName = normalizeName(normalizedType, name, qualifiers);
    const normalizedNamespace = normalizeNamespace(normalizedType, namespace);
    const normalizedVersion = normalizeVersion(normalizedType, version);

    // Enforce type-specific rules
    enforceTypeRules(normalizedType, normalizedNamespace, normalizedName, qualifiers);

    return new PackageURL(
      normalizedType,
      normalizedNamespace,
      normalizedName,
      normalizedVersion,
      qualifiers,
      subpath,
      INTERNAL
    );
  }

  /**
   * Build the canonical PURL string.
   */
  toString(): string {
    let result = 'pkg:' + this.type + '/';

    if (this.namespace) {
      const nsSegments = this.namespace.split('/').filter((s) => s !== '');
      result += nsSegments.map((s) => percentEncode(s)).join('/');
      result += '/';
    }

    result += percentEncode(this.name);

    if (this.version !== null && this.version !== '') {
      result += '@' + percentEncode(this.version);
    }

    if (this.qualifiers) {
      const keys = Object.keys(this.qualifiers).sort();
      const pairs: string[] = [];
      for (const key of keys) {
        const val = this.qualifiers[key];
        if (val !== '' && val !== undefined) {
          pairs.push(key + '=' + percentEncode(val));
        }
      }
      if (pairs.length > 0) {
        result += '?' + pairs.join('&');
      }
    }

    if (this.subpath) {
      result +=
        '#' +
        this.subpath
          .split('/')
          .filter((s) => s !== '' && s !== '.' && s !== '..')
          .map((s) => percentEncode(s))
          .join('/');
    }

    return result;
  }

  /**
   * Return a new PackageURL with a different version.
   */
  withVersion(version: string): PackageURL {
    if (!version) throw new Error('version is required; use withoutVersion() to remove version');
    return new PackageURL(this.type, this.namespace, this.name, version, this.qualifiers, this.subpath);
  }

  /**
   * Return a new PackageURL without version.
   */
  withoutVersion(): PackageURL {
    return new PackageURL(this.type, this.namespace, this.name, null, this.qualifiers, this.subpath);
  }

  /**
   * Return a new PackageURL with replaced qualifiers.
   */
  withQualifiers(qualifiers: Qualifiers): PackageURL {
    return new PackageURL(this.type, this.namespace, this.name, this.version, qualifiers, this.subpath);
  }

  /**
   * Get a single qualifier value by key.
   */
  getQualifier(key: string): string | undefined {
    return this.qualifiers?.[key];
  }

  /**
   * Check semantic equality after normalization.
   */
  equals(other: PackageURL): boolean {
    return this.toString() === other.toString();
  }

  /**
   * Check if two PURLs refer to the same package (ignoring version, qualifiers, subpath).
   */
  matchesBase(other: PackageURL): boolean {
    return this.type === other.type && this.namespace === other.namespace && this.name === other.name;
  }

  /**
   * Validate against the full spec including type-specific rules.
   */
  validate(): ValidationError | null {
    return validate(this);
  }
}

// ---- Type-specific enforcement (during parse and build) ----

function enforceTypeRules(
  type: string,
  namespace: string | null,
  name: string,
  qualifiers: Qualifiers | null
): void {
  const typeDef = lookupType(type);
  if (!typeDef) return;

  if (typeDef.namespace.requirement === 'required' && !namespace) {
    throw new Error(`namespace is required for type "${type}"`);
  }
  if (typeDef.namespace.requirement === 'prohibited' && namespace) {
    throw new Error(`namespace is not allowed for type "${type}"`);
  }

  // CPAN: name must not contain ::
  if (type === 'cpan' && name.includes('::')) {
    throw new Error('CPAN distribution name must not contain "::"');
  }

  // Julia: uuid qualifier is required
  if (type === 'julia') {
    if (!qualifiers || !qualifiers['uuid']) {
      throw new Error('qualifier "uuid" is required for type "julia"');
    }
  }

  // Required qualifiers check
  if (typeDef.qualifiers) {
    for (const qDef of typeDef.qualifiers) {
      if (qDef.requirement === 'required') {
        if (!qualifiers || !qualifiers[qDef.key]) {
          throw new Error(`qualifier "${qDef.key}" is required for type "${type}"`);
        }
      }
    }
  }
}

// ---- Normalization helpers ----

function normalizeName(type: string, name: string, qualifiers?: Qualifiers | null): string {
  const typeDef = lookupType(type);
  if (!typeDef) return name;

  let result = name;

  // MLflow: case depends on repository_url (Databricks = lowercase, Azure ML = preserve)
  if (type === 'mlflow') {
    const repoUrl = qualifiers?.['repository_url'] ?? '';
    if (repoUrl.includes('databricks')) {
      result = result.toLowerCase();
    }
    // Azure ML and others: preserve case
    return result;
  }

  // General case normalization
  if (!typeDef.name.caseSensitive) {
    result = result.toLowerCase();
  }

  // PyPI: replace _ with -
  if (type === 'pypi') {
    result = result.replace(/_/g, '-');
  }

  return result;
}

function normalizeNamespace(type: string, namespace: string | null): string | null {
  if (!namespace) return null;

  const typeDef = lookupType(type);
  if (!typeDef) return namespace;

  if (!typeDef.namespace.caseSensitive) {
    return namespace.toLowerCase();
  }

  return namespace;
}

function normalizeVersion(type: string, version: string | null): string | null {
  if (!version) return null;

  const typeDef = lookupType(type);
  if (!typeDef) return version;

  if (!typeDef.version.caseSensitive) {
    return version.toLowerCase();
  }

  return version;
}

function normalizeQualifiers(qualifiers: Qualifiers | null): Qualifiers | null {
  if (!qualifiers) return null;
  const result: Qualifiers = Object.create(null);
  let hasKeys = false;
  for (const [key, value] of Object.entries(qualifiers)) {
    if (value !== '' && value !== undefined) {
      result[key.toLowerCase()] = value;
      hasKeys = true;
    }
  }
  return hasKeys ? result : null;
}

function normalizeSubpath(subpath: string | null): string | null {
  if (!subpath) return null;
  const segments = subpath.split('/').filter((s) => s !== '' && s !== '.' && s !== '..');
  return segments.length > 0 ? segments.join('/') : null;
}

function parseSubpath(raw: string): string | null {
  const segments: string[] = [];
  for (const s of raw.split('/')) {
    if (s === '' || s === '.' || s === '..') continue;
    const decoded = percentDecode(s);
    if (decoded.includes('/')) {
      throw new Error(
        `subpath segment "${truncate(s)}" decodes to a value containing "/", which would corrupt segment boundaries`
      );
    }
    segments.push(decoded);
  }
  return segments.length > 0 ? segments.join('/') : null;
}

function parseQualifiers(raw: string): Qualifiers | null {
  if (!raw) return null;
  const result: Qualifiers = Object.create(null);
  let hasKeys = false;
  let count = 0;
  const pairs = raw.split('&');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx).toLowerCase();
    const value = percentDecode(pair.substring(eqIdx + 1));

    // Validate key format
    if (!QUALIFIER_KEY_RE.test(key)) {
      throw new Error(`invalid qualifier key "${truncate(key)}"`);
    }

    if (value !== '') {
      if (++count > MAX_QUALIFIERS) {
        throw new Error(`too many qualifiers (max ${MAX_QUALIFIERS})`);
      }
      if (key in result) {
        throw new Error(`duplicate qualifier key "${truncate(key)}"`);
      }
      result[key] = value;
      hasKeys = true;
    }
  }
  return hasKeys ? result : null;
}

/** Truncate attacker-controlled strings before embedding in error messages. */
function truncate(s: string, max = 100): string {
  return s.length > max ? s.substring(0, max) + '...' : s;
}

/** Reject strings containing null bytes. */
function rejectNullBytes(s: string, field: string): void {
  if (s.includes('\0')) {
    throw new Error(`null bytes are not allowed in ${field}`);
  }
}

/** Reject strings exceeding the component length limit. */
function rejectOverlong(s: string, field: string): void {
  if (s.length > MAX_COMPONENT_LENGTH) {
    throw new Error(`${field} exceeds maximum length of ${MAX_COMPONENT_LENGTH}`);
  }
}

/**
 * Parse a PURL string, returning null instead of throwing on failure.
 */
export function tryParse(purl: string): PackageURL | null {
  try {
    return PackageURL.parse(purl);
  } catch {
    return null;
  }
}

/**
 * Validate a PURL string. Returns null if valid, or an error.
 */
export function validateString(purl: string): ValidationError | null {
  try {
    const p = PackageURL.parse(purl);
    return validate(p);
  } catch (e) {
    return new ValidationError([
      {
        field: 'purl',
        code: 'parse_error',
        message: e instanceof Error ? e.message : String(e),
      },
    ]);
  }
}

/**
 * Check if a string is a valid PURL.
 */
export function isValid(purl: string): boolean {
  return validateString(purl) === null;
}
