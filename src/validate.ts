import { lookupType } from './types.js';
import type { PackageURL } from './packageurl.js';

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export class ValidationError extends Error {
  errors: FieldError[];

  constructor(errors: FieldError[]) {
    const msg = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    super(msg);
    this.name = 'ValidationError';
    this.errors = errors;
  }

  hasField(field: string): boolean {
    return this.errors.some((e) => e.field === field);
  }
}

const TYPE_RE = /^[a-zA-Z][a-zA-Z0-9.+-]*$/;
const QUALIFIER_KEY_RE = /^[a-z][a-z0-9._-]*$/;

/**
 * Validate a PackageURL against the full spec, including type-specific rules.
 * Returns null if valid, or a ValidationError with all violations.
 */
export function validate(purl: PackageURL): ValidationError | null {
  const errors: FieldError[] = [];

  // Type validation
  if (!purl.type) {
    errors.push({ field: 'type', code: 'required', message: 'type is required' });
  } else if (!TYPE_RE.test(purl.type)) {
    errors.push({
      field: 'type',
      code: 'invalid_characters',
      message: `type "${purl.type}" contains invalid characters (must be ASCII letters, numbers, period, plus, or dash, starting with a letter)`,
    });
  }

  // Name validation
  if (!purl.name) {
    errors.push({ field: 'name', code: 'required', message: 'name is required' });
  }

  // Qualifier key validation
  if (purl.qualifiers) {
    for (const key of Object.keys(purl.qualifiers)) {
      if (!QUALIFIER_KEY_RE.test(key)) {
        errors.push({
          field: 'qualifiers',
          code: 'invalid_key',
          message: `qualifier key "${key}" is invalid (must be lowercase ASCII letters, numbers, period, dash, or underscore, starting with a letter)`,
        });
      }
    }
  }

  // Type-specific validation
  const typeDef = lookupType(purl.type);
  if (typeDef) {
    // Namespace requirement
    if (typeDef.namespace.requirement === 'required' && !purl.namespace) {
      errors.push({
        field: 'namespace',
        code: 'required',
        message: `namespace is required for type "${purl.type}"`,
      });
    }
    if (typeDef.namespace.requirement === 'prohibited' && purl.namespace) {
      errors.push({
        field: 'namespace',
        code: 'prohibited',
        message: `namespace is not allowed for type "${purl.type}"`,
      });
    }

    // Subpath check
    if (typeDef.subpath) {
      if (typeDef.subpath.requirement === 'prohibited' && purl.subpath) {
        errors.push({
          field: 'subpath',
          code: 'prohibited',
          message: `subpath is not allowed for type "${purl.type}"`,
        });
      }
    }

    // CPAN: name must not contain ::
    if (purl.type === 'cpan' && purl.name.includes('::')) {
      errors.push({
        field: 'name',
        code: 'invalid_format',
        message: 'CPAN distribution name must not contain "::"',
      });
    }

    // Required qualifiers
    if (typeDef.qualifiers) {
      for (const qDef of typeDef.qualifiers) {
        if (qDef.requirement === 'required') {
          if (!purl.qualifiers || !purl.qualifiers[qDef.key]) {
            errors.push({
              field: 'qualifiers',
              code: 'required_qualifier',
              message: `qualifier "${qDef.key}" is required for type "${purl.type}"`,
            });
          }
        }
      }
    }
  }

  return errors.length > 0 ? new ValidationError(errors) : null;
}

/**
 * Validate a PURL string. Parses and validates in one step.
 */
export { validate as validateComponents };
