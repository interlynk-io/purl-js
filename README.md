# @interlynk/lynk-js-purl

A spec-compliant [Package URL (PURL)](https://github.com/package-url/purl-spec) parser, builder, and validator for JavaScript/TypeScript. Supports all 39 registered PURL types with type-specific normalization and validation.

## Installation

```bash
npm install @interlynk/lynk-js-purl
```

## Quick Start

```typescript
import { PackageURL, tryParse, isValid, validate } from '@interlynk/lynk-js-purl';

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
import { lookupType } from '@interlynk/lynk-js-purl';

const pypi = lookupType('pypi');
console.log(pypi?.namespace.requirement);  // "prohibited"
console.log(pypi?.name.caseSensitive);     // false
```

#### `registeredTypes(): string[]`

Get all registered type identifiers, sorted alphabetically.

```typescript
import { registeredTypes } from '@interlynk/lynk-js-purl';

console.log(registeredTypes());
// ["alpm", "apk", "bazel", "bitbucket", "bitnami", "cargo", ...]
```

#### `registerType(def: TypeDefinition): void`

Register or override a custom type definition.

```typescript
import { registerType } from '@interlynk/lynk-js-purl';

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

All 39 PURL types from the specification are supported:

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

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Run Tests

The library includes 514 spec-compliance tests covering all types:

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
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
- **Type Registry** - Browse all 39 registered types and their rules

## License

Apache-2.0
