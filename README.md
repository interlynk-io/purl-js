# @interlynk-io/purl-js

A spec-compliant [Package URL (PURL)](https://github.com/package-url/purl-spec) parser, builder, and validator for JavaScript/TypeScript.

## Features

- **ECMA-427 compliant** — passes all 514 official [purl-spec](https://github.com/package-url/purl-spec/tree/main/tests) tests
- **All 38 registered types** — full type-specific normalization and validation
- **Zero runtime dependencies** — only `typescript` and `vitest` as dev dependencies
- **Immutable & type-safe** — frozen instances, null-prototype qualifiers, full TypeScript types
- **Secure by default** — null byte rejection, input length limits, prototype pollution protection
- **Fast** — 34M ops/sec for typical package name encoding (see [Performance](#performance))
- **752 tests** — 514 spec + 210 ECMA-427 compliance + 28 security

## Installation

```bash
npm install @interlynk-io/purl-js
```

## Quick Start

```typescript
import { PackageURL, tryParse, isValid, validateString } from '@interlynk-io/purl-js';

// Parse a PURL string
const purl = PackageURL.parse('pkg:npm/%40angular/core@16.2.0');
console.log(purl.type);      // "npm"
console.log(purl.namespace);  // "@angular"
console.log(purl.name);       // "core"
console.log(purl.version);    // "16.2.0"

// Build a PURL from components
const built = new PackageURL('pypi', null, 'Django', '4.2', null, null);
console.log(built.toString()); // "pkg:pypi/django@4.2"

// Safe parsing (returns null instead of throwing)
const result = tryParse('not-a-purl'); // null

// Validation
isValid('pkg:npm/express@4.18.2');  // true
isValid('pkg:julia/Flux');           // false (requires uuid qualifier)
```

## Use Cases

### Parse and inspect SBOMs

```typescript
const components = sbom.components.map(c => {
  const purl = tryParse(c.purl);
  return {
    ecosystem: purl?.type,
    package: purl?.name,
    version: purl?.version,
    scope: purl?.namespace,
  };
});
```

### Compare package versions

```typescript
const current = PackageURL.parse('pkg:npm/lodash@4.17.20');
const updated = PackageURL.parse('pkg:npm/lodash@4.17.21');

if (current.matchesBase(updated) && !current.equals(updated)) {
  console.log(`Update available: ${current.version} -> ${updated.version}`);
}
```

### Validate user input

```typescript
function handlePurlInput(input: string) {
  const err = validateString(input);
  if (err) {
    return { valid: false, errors: err.errors.map(e => e.message) };
  }
  return { valid: true, purl: PackageURL.parse(input) };
}
```

### Build PURLs programmatically

```typescript
new PackageURL('npm', '@angular', 'core', '16.2.0', null, null).toString();
// "pkg:npm/%40angular/core@16.2.0"

new PackageURL('maven', 'org.junit', 'junit', '5.0', { classifier: 'sources' }, null).toString();
// "pkg:maven/org.junit/junit@5.0?classifier=sources"

new PackageURL('docker', 'library', 'nginx', 'latest', { arch: 'amd64' }, null).toString();
// "pkg:docker/library/nginx@latest?arch=amd64"
```

### Type-specific normalization

The library automatically applies normalization rules per type:

```typescript
// PyPI: underscores become dashes, name lowercased
PackageURL.parse('pkg:pypi/My_Package@1.0').toString();
// "pkg:pypi/my-package@1.0"

// npm: namespace and name lowercased
PackageURL.parse('pkg:npm/%40Angular/Core@16.0').toString();
// "pkg:npm/%40angular/core@16.0"

// Hugging Face: version (commit hash) lowercased
PackageURL.parse('pkg:huggingface/google/bert-base-uncased@CD5EF3A3').toString();
// "pkg:huggingface/google/bert-base-uncased@cd5ef3a3"
```

## API Reference

### `PackageURL` Class

All instances are immutable. Properties are `readonly`.

| Property     | Type                             | Description                |
| ------------ | -------------------------------- | -------------------------- |
| `type`       | `string`                         | Package type (e.g., `npm`) |
| `namespace`  | `string \| null`                 | Package namespace/scope    |
| `name`       | `string`                         | Package name               |
| `version`    | `string \| null`                 | Package version            |
| `qualifiers` | `Record<string, string> \| null` | Key-value qualifier pairs  |
| `subpath`    | `string \| null`                 | Subpath within the package |

#### Parsing & Building

| Method | Description |
| ------ | ----------- |
| `PackageURL.parse(purl: string): PackageURL` | Parse a PURL string (right-to-left algorithm). Throws on invalid input. |
| `new PackageURL(type, namespace, name, version, qualifiers, subpath)` | Build from components with type-specific normalization and validation. |
| `toString(): string` | Return the canonical PURL string. |

#### Transformations

| Method | Description |
| ------ | ----------- |
| `withVersion(version: string): PackageURL` | New instance with a different version. |
| `withoutVersion(): PackageURL` | New instance with version removed. |
| `withQualifiers(qualifiers: Record<string, string>): PackageURL` | New instance with replaced qualifiers. |

#### Comparison & Validation

| Method | Description |
| ------ | ----------- |
| `equals(other: PackageURL): boolean` | Semantic equality after normalization. |
| `matchesBase(other: PackageURL): boolean` | Same package ignoring version, qualifiers, subpath. |
| `getQualifier(key: string): string \| undefined` | Get a single qualifier value. |
| `validate(): ValidationError \| null` | Full spec validation including type-specific rules. |

### Utility Functions

| Function | Description |
| -------- | ----------- |
| `tryParse(purl: string): PackageURL \| null` | Parse without throwing — returns `null` on failure. |
| `isValid(purl: string): boolean` | Check if a string is a valid PURL. |
| `validateString(purl: string): ValidationError \| null` | Parse + validate in one step. Returns error details or `null`. |

### Type Registry

| Function | Description |
| -------- | ----------- |
| `lookupType(type: string): TypeDefinition \| undefined` | Look up a registered type definition (returns frozen object). |
| `registeredTypes(): string[]` | All registered type identifiers, sorted alphabetically. |
| `registerType(def: TypeDefinition): void` | Register a custom type. Cannot override the 38 built-in spec types. |

```typescript
import { lookupType, registeredTypes, registerType } from '@interlynk-io/purl-js';

const pypi = lookupType('pypi');
console.log(pypi?.namespace.requirement);  // "prohibited"
console.log(pypi?.name.caseSensitive);     // false

console.log(registeredTypes());
// ["alpm", "apk", "bazel", "bitbucket", "bitnami", "cargo", ...]

registerType({
  type: 'custom',
  typeName: 'Custom',
  description: 'My custom package type',
  repository: { useRepository: false },
  namespace: { requirement: 'optional', caseSensitive: true },
  name: { requirement: 'required', caseSensitive: true },
  version: { requirement: 'optional', caseSensitive: true },
  examples: ['pkg:custom/mypackage@1.0'],
});
```

## Supported Types

<details>
<summary>All 38 PURL types from the specification (click to expand)</summary>

| Type | Description | Namespace |
| ---- | ----------- | --------- |
| `alpm` | Arch Linux packages | required |
| `apk` | APK-based packages | required |
| `bazel` | Bazel modules | prohibited |
| `bitbucket` | Bitbucket repos | required |
| `bitnami` | Bitnami packages | prohibited |
| `cargo` | Rust Cargo crates | prohibited |
| `cocoapods` | CocoaPods | optional |
| `composer` | PHP Composer | required |
| `conan` | C/C++ Conan | optional |
| `conda` | Conda packages | optional |
| `cpan` | Perl CPAN | required |
| `cran` | R packages | prohibited |
| `deb` | Debian packages | required |
| `docker` | Docker images | optional |
| `gem` | Ruby gems | optional |
| `generic` | Generic packages | optional |
| `github` | GitHub repos | required |
| `golang` | Go packages | required |
| `hackage` | Haskell packages | optional |
| `hex` | Hex packages | optional |
| `huggingface` | Hugging Face models | required |
| `julia` | Julia packages | prohibited |
| `luarocks` | Lua packages | optional |
| `maven` | Maven artifacts | required |
| `mlflow` | MLflow models | prohibited |
| `npm` | Node npm packages | optional |
| `nuget` | .NET NuGet | prohibited |
| `oci` | OCI images | prohibited |
| `opam` | OCaml packages | optional |
| `otp` | Erlang/OTP | prohibited |
| `pub` | Dart/Flutter pub | optional |
| `pypi` | Python packages | prohibited |
| `qpkg` | QNX packages | optional |
| `rpm` | RPM packages | required |
| `swid` | ISO SWID tags | optional |
| `swift` | Swift packages | required |
| `vscode-extension` | VS Code extensions | required |
| `yocto` | Yocto recipes | required |

</details>

## Spec Compliance

Fully compliant with [ECMA-427 / TC54](https://github.com/package-url/purl-spec). The test suite includes all 514 official spec tests sourced from the upstream [`package-url/purl-spec`](https://github.com/package-url/purl-spec/tree/main/tests) repository, plus a dedicated 210-test ECMA-427 compliance suite.

**Verified:**
right-to-left parsing algorithm, percent-encoding (unreserved set `A-Za-z0-9.-_~:`, uppercase hex), checksum qualifier `%2C` encoding, subpath `.`/`..` discard and `%2F` rejection, qualifier key validation and duplicate rejection, namespace `%2F` segment boundary protection, scheme validation, type-specific normalization (PyPI `_`→`-`, npm lowercase, Hugging Face version lowercase, MLflow conditional case), namespace required/prohibited enforcement, required qualifier enforcement (Julia `uuid`, SWID `tag_id`), CPAN `::` rejection, npm `@scope` handling.

## Security

Designed for untrusted input. Key protections:

- **Input limits** — `parse()` enforces 64 KB max input, 128-qualifier limit, 4 KB per-component limit
- **Injection prevention** — null bytes (`\0`, `%00`) rejected in all fields and during percent-decoding
- **Immutability** — qualifier objects use `Object.create(null)` (no prototype pollution) and `Object.freeze`
- **Internal bypass protection** — constructor skip-normalization gated by module-private `Symbol`
- **Registry protection** — built-in types cannot be overridden via `registerType()`
- **Defense-in-depth** — `toString()` re-filters `..` from subpath; error messages truncate attacker-controlled strings; `validate()` catches invalid states from manual object construction

```typescript
// For untrusted input, prefer parse() or tryParse()
const purl = tryParse(userInput);
if (!purl) { /* handle invalid input */ }

// If using the constructor with user-supplied components, validate afterward
const built = new PackageURL(type, ns, name, ver, quals, sub);
const err = built.validate();
if (err) { /* handle validation errors */ }
```

## Performance

Optimized for the typical PURL workload: short ASCII strings with occasional percent-encoding.

Run with `npx vitest bench`. Results on Apple M-series (Node.js 24):

| Function | Input | ops/sec | Latency |
|----------|-------|---------|---------|
| `percentEncode` | Short ASCII (7 chars) | **34M** | 29 ns |
| | Mixed (46 chars) | **2.7M** | 370 ns |
| | Unicode (12 chars) | **2.9M** | 340 ns |
| | Long (1550 chars) | **150K** | 6.6 μs |
| `percentDecode` | Short ASCII | **38M** | 26 ns |
| | Mixed | **4.9M** | 206 ns |
| | Unicode | **4M** | 252 ns |
| | Long | **583K** | 1.7 μs |

**Optimizations:** fast-path short-circuit for all-ASCII strings, pre-computed 256-entry byte→encoded lookup table, shared `TextEncoder` instance, fast-path decode when no `%` present, O(1) slash stripping via index scanning.

## Development

### Setup

```bash
npm install
```

### Tests

```bash
npm test              # Run all 752 tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

### Benchmarks

```bash
npx vitest bench
```

### Build

```bash
npm run build  # Outputs to ./dist
```

### Playground

Interactive browser-based playground for exploring PURL parsing, building, and validation. No build step required — Vite serves TypeScript directly.

```bash
npx vite --open playground.html --port 5555
```

Four tabs:

- **Parse** — enter a PURL string, see parsed components and canonical form. Quick-try buttons for npm, maven, pypi, docker, golang, and oci.
- **Build** — select a type, fill in components, add qualifiers dynamically. Namespace auto-disables for types that prohibit it.
- **Validate** — green/red validation with detailed error cards (field, code, message). Quick-try buttons for common failures.
- **Type Registry** — browse all 38 types with namespace/name/version rules, case sensitivity, qualifiers, and clickable examples.

## License

Apache-2.0
