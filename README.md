# @interlynk-io/purl-js

A spec-compliant [Package URL (PURL)](https://github.com/package-url/purl-spec) parser, builder, and validator for JavaScript/TypeScript. Supports all 38 registered PURL types with type-specific normalization and validation.

## Installation

```bash
npm install @interlynk-io/purl-js
```

## Quick Start

```typescript
import { PackageURL, tryParse, isValid, validate } from '@interlynk-io/purl-js';

// Parse a PURL string
const purl = PackageURL.parse('pkg:npm/%40angular/core@16.2.0');
console.log(purl.type);      // "npm"
console.log(purl.namespace);  // "@angular"
console.log(purl.name);       // "core"
console.log(purl.version);    // "16.2.0"

// Build a PURL from components
const built = new PackageURL('pypi', null, 'Django', '4.2', null, null);
console.log(built.toString()); // "pkg:pypi/django@4.2"
```

## API Reference

### `PackageURL` Class

The core class for parsing and building PURLs. All instances are immutable.

#### Properties

| Property     | Type                        | Description                     |
| ------------ | --------------------------- | ------------------------------- |
| `type`       | `string`                    | Package type (e.g., `npm`)      |
| `namespace`  | `string \| null`            | Package namespace/scope         |
| `name`       | `string`                    | Package name                    |
| `version`    | `string \| null`            | Package version                 |
| `qualifiers` | `Record<string, string> \| null` | Key-value qualifier pairs  |
| `subpath`    | `string \| null`            | Subpath within the package      |

#### `PackageURL.parse(purl: string): PackageURL`

Parse a PURL string using the spec's right-to-left algorithm. Throws on invalid input.

```typescript
const purl = PackageURL.parse('pkg:maven/org.apache.commons/commons-lang3@3.12.0');
console.log(purl.namespace); // "org.apache.commons"
console.log(purl.name);      // "commons-lang3"
```

#### `new PackageURL(type, namespace, name, version, qualifiers, subpath)`

Build a PURL from individual components. Applies type-specific normalization and validation.

```typescript
const purl = new PackageURL(
  'docker',
  'library',
  'nginx',
  '1.25',
  { arch: 'amd64' },
  null
);
console.log(purl.toString());
// "pkg:docker/library/nginx@1.25?arch=amd64"
```

#### `toString(): string`

Return the canonical PURL string representation.

#### `withVersion(version: string): PackageURL`

Return a new PackageURL with a different version.

```typescript
const v1 = PackageURL.parse('pkg:npm/lodash@4.17.20');
const v2 = v1.withVersion('4.17.21');
console.log(v2.toString()); // "pkg:npm/lodash@4.17.21"
```

#### `withoutVersion(): PackageURL`

Return a new PackageURL with the version removed.

```typescript
const purl = PackageURL.parse('pkg:pypi/requests@2.31.0');
console.log(purl.withoutVersion().toString()); // "pkg:pypi/requests"
```

#### `withQualifiers(qualifiers: Record<string, string>): PackageURL`

Return a new PackageURL with replaced qualifiers.

```typescript
const purl = PackageURL.parse('pkg:npm/express@4.18.2');
const withRepo = purl.withQualifiers({ repository_url: 'https://registry.example.com' });
```

#### `getQualifier(key: string): string | undefined`

Get a single qualifier value by key.

```typescript
const purl = PackageURL.parse('pkg:maven/org.junit/junit@5.0?classifier=sources');
console.log(purl.getQualifier('classifier')); // "sources"
```

#### `equals(other: PackageURL): boolean`

Check if two PURLs are semantically equal (after normalization).

```typescript
const a = PackageURL.parse('pkg:pypi/Django@4.2');
const b = PackageURL.parse('pkg:pypi/django@4.2');
console.log(a.equals(b)); // true (pypi names are case-insensitive)
```

#### `matchesBase(other: PackageURL): boolean`

Check if two PURLs refer to the same package, ignoring version, qualifiers, and subpath.

```typescript
const a = PackageURL.parse('pkg:npm/react@17.0.0');
const b = PackageURL.parse('pkg:npm/react@18.2.0');
console.log(a.matchesBase(b)); // true
```

#### `validate(): ValidationError | null`

Run full spec validation including type-specific rules. Returns `null` if valid.

```typescript
const purl = PackageURL.parse('pkg:npm/express@4.18.2');
const err = purl.validate();
if (err) {
  console.log(err.errors); // Array of { field, code, message }
}
```

### Utility Functions

#### `tryParse(purl: string): PackageURL | null`

Parse a PURL string, returning `null` instead of throwing on failure. Useful for defensive parsing of untrusted input.

```typescript
const result = tryParse('not-a-purl');
console.log(result); // null

const purl = tryParse('pkg:npm/express@4.18.2');
console.log(purl?.name); // "express"
```

#### `isValid(purl: string): boolean`

Check if a string is a valid PURL.

```typescript
isValid('pkg:npm/express@4.18.2');  // true
isValid('not-a-purl');               // false
isValid('pkg:julia/Flux');           // false (julia requires uuid qualifier)
```

#### `validateString(purl: string): ValidationError | null`

Validate a PURL string. Returns `null` if valid, or a `ValidationError` with details.

```typescript
const err = validateString('pkg:maven/commons-lang3@3.12.0');
if (err) {
  for (const e of err.errors) {
    console.log(`${e.field}: ${e.message}`);
    // "namespace: namespace is required for type "maven""
  }
}
```

### Type Registry

#### `lookupType(type: string): TypeDefinition | undefined`

Look up a registered PURL type definition.

```typescript
import { lookupType } from '@interlynk-io/purl-js';

const pypi = lookupType('pypi');
console.log(pypi?.namespace.requirement);  // "prohibited"
console.log(pypi?.name.caseSensitive);     // false
```

#### `registeredTypes(): string[]`

Get all registered type identifiers, sorted alphabetically.

```typescript
import { registeredTypes } from '@interlynk-io/purl-js';

console.log(registeredTypes());
// ["alpm", "apk", "bazel", "bitbucket", "bitnami", "cargo", ...]
```

#### `registerType(def: TypeDefinition): void`

Register a custom type definition. Cannot override the 38 built-in spec types.

```typescript
import { registerType } from '@interlynk-io/purl-js';

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
// npm scoped package
new PackageURL('npm', '@angular', 'core', '16.2.0', null, null).toString();
// "pkg:npm/%40angular/core@16.2.0"

// Maven with classifier
new PackageURL('maven', 'org.junit', 'junit', '5.0', { classifier: 'sources' }, null).toString();
// "pkg:maven/org.junit/junit@5.0?classifier=sources"

// Docker image with qualifier
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

## Supported Types

All 38 PURL types from the specification are supported:

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

## Spec Compliance

This library is fully compliant with the [Package URL specification](https://github.com/package-url/purl-spec) (ECMA-427 / TC54). The test suite includes all 514 official spec tests (18 core specification tests + 496 type-specific tests) sourced directly from the upstream [`package-url/purl-spec`](https://github.com/package-url/purl-spec/tree/main/tests) repository, plus 28 additional security tests.

### Verified Compliance

- **Right-to-left parsing algorithm** — subpath (`#`), qualifiers (`?`), scheme (`:`), type (`/`), version (`@`), name (`/`), namespace
- **Percent-encoding** — unreserved set `A-Za-z0-9.-_~:` not encoded; uppercase hex (`%2F` not `%2f`); colons preserved unencoded
- **Checksum qualifier** — comma-separated values are percent-encoded as `%2C` in canonical output, matching spec expectations
- **Subpath safety** — `.` and `..` segments are discarded; encoded `/` (`%2F`) in subpath segments is rejected to prevent boundary corruption
- **Qualifier keys** — must start with a letter, contain only `a-z0-9._-`, are lowercased; duplicates are rejected; empty values are discarded; sorted lexicographically in output
- **Namespace segment integrity** — encoded `/` (`%2F`) inside namespace segments is rejected to prevent segment boundary corruption
- **Scheme validation** — only `pkg:` is accepted; encoded colons (`%3A`) in the scheme position are rejected
- **Type-specific normalization** — PyPI (`_` → `-`, lowercase), npm (lowercase name/namespace), Hugging Face (version lowercase), MLflow (conditional case based on `repository_url`), and all other type rules
- **Namespace enforcement** — required/prohibited/optional per type definition (e.g., maven requires namespace, pypi prohibits it)
- **Required qualifier enforcement** — Julia `uuid`, SWID `tag_id`, and all other required qualifiers per type
- **CPAN name validation** — `::` in distribution name is rejected
- **`@` handling** — correctly distinguishes npm scoped packages (`@scope/name`) from version separators

### Running Spec Tests

The official test data is bundled in `testdata/`. To verify compliance:

```bash
npm test   # Runs all 752 tests (514 spec + 210 ECMA-427 + 28 security)
```

## Security

This library is designed to safely handle untrusted input. All public APIs enforce the following protections:

### Input validation

- **`parse()`** enforces a 64 KB maximum input length and a 128-qualifier limit to prevent denial-of-service.
- **Constructor** validates type characters against `^[a-zA-Z][a-zA-Z0-9.+-]*$`, rejects null bytes (`\0`) in every field, and enforces a 4 KB per-component length limit.
- **Percent-encoding** rejects malformed `%XX` sequences and null bytes (`%00`) during parsing.

### Immutability

- All qualifier objects use `Object.create(null)` (no prototype) and are `Object.freeze`d after construction. Post-construction mutation throws in strict mode.
- `lookupType()` returns deeply frozen objects. Mutating a returned `TypeDefinition` throws.

### Internal bypass protection

- The constructor's internal skip-normalization path is gated by a module-private `Symbol`. External callers cannot bypass validation — passing `true` or any other value for the 7th parameter triggers full validation.

### Registry protection

- Built-in spec types (all 38) cannot be overridden via `registerType()`. Attempting to do so throws. Custom types are still allowed.

### Defense-in-depth

- `toString()` re-filters `.` and `..` from subpath segments to prevent path traversal, even if internal state were somehow corrupted.
- Error messages truncate attacker-controlled strings to prevent log flooding.
- `validate()` checks for null bytes, subpath traversal, lowercase type, and lowercase qualifier keys — catching invalid states that could arise from manual object construction.

### Recommendations for consumers

```typescript
// Always prefer parse() or tryParse() for untrusted input.
// The constructor is for programmatic building with trusted components.
const purl = tryParse(userInput);
if (!purl) {
  // handle invalid input
}

// If you must use the constructor with user-supplied components,
// always call validate() afterward:
const built = new PackageURL(type, ns, name, ver, quals, sub);
const err = built.validate();
if (err) {
  // handle validation errors
}
```

## Performance

The encoding layer is optimized for the typical PURL workload: short ASCII strings (package names, namespaces) with occasional percent-encoding.

### Benchmarks

Run with `npx vitest bench`. Results on Apple M-series (Node.js 22):

#### `percentEncode`

| Input | ops/sec | Latency (mean) |
|-------|---------|----------------|
| Short ASCII (7 chars, e.g. `express`) | **33M** | 30 ns |
| Mixed (46 chars, e.g. URL with special chars) | **2.7M** | 370 ns |
| Unicode (12 chars, CJK) | **2.9M** | 350 ns |
| Long mixed (1550 chars) | **152K** | 6.6 μs |

#### `percentDecode`

| Input | ops/sec | Latency (mean) |
|-------|---------|----------------|
| Short ASCII (no `%XX`) | **35M** | 28 ns |
| Mixed (some `%XX`) | **5M** | 200 ns |
| Unicode (dense `%XX`) | **4M** | 250 ns |
| Long mixed | **569K** | 1.8 μs |

### Optimizations

- **Fast-path short-circuit**: `percentEncode` scans via `charCodeAt` and returns the input unchanged if every character is unreserved ASCII. This is the common case for package names and namespaces.
- **Lookup table encoding**: A pre-computed 256-entry `BYTE_TO_ENCODED` table maps every byte to its output string. Eliminates per-byte branching, `toString(16)`, and `padStart` calls.
- **Shared `TextEncoder`**: A single module-level instance avoids per-call allocation.
- **Fast-path decode**: `percentDecode` returns the input unchanged if the string contains no `%` character, skipping `decodeURIComponent` entirely.
- **O(1) slash stripping**: Leading/trailing slash removal in `parse()` uses index scanning with a single `substring` call instead of a loop of `substring` calls.

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Run Tests

The library includes 752 tests: 514 upstream spec data-driven tests, 210 ECMA-427 compliance tests, and 28 security tests.

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

### Run Benchmarks

```bash
npx vitest bench
```

### Build

```bash
npm run build  # Outputs to ./dist
```

### Playground

A browser-based playground is included for manual testing. It provides tabs for parsing, building, validating, and browsing the type registry.

```bash
npx vite --open playground.html --port 5555
```

This opens a local dev server at `http://localhost:5555/playground.html` with four tabs:

- **Parse** - Enter a PURL string and see parsed components
- **Build** - Enter components and generate a PURL string
- **Validate** - Validate a PURL string against spec rules
- **Type Registry** - Browse all 38 registered types and their rules

## License

Apache-2.0
