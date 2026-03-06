export type Requirement = 'required' | 'optional' | 'prohibited';

export interface FieldDefinition {
  requirement: Requirement;
  caseSensitive: boolean;
  nativeName?: string;
  normalizationRules?: string[];
  note?: string;
}

export interface QualifierDefinition {
  key: string;
  requirement: Requirement;
  description?: string;
  nativeName?: string;
  defaultValue?: string;
}

export interface TypeDefinition {
  type: string;
  typeName: string;
  description: string;
  repository: {
    useRepository: boolean;
    defaultRepositoryUrl?: string;
  };
  namespace: FieldDefinition;
  name: FieldDefinition;
  version: FieldDefinition;
  subpath?: FieldDefinition;
  qualifiers?: QualifierDefinition[];
  examples: string[];
}

// Internal registry
const registry = new Map<string, TypeDefinition>();
const builtinTypes = new Set<string>();

/** Deep-freeze an object and all nested objects. */
function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val as object);
    }
  }
  return obj;
}

/**
 * Look up a registered PURL type definition.
 * Returns a frozen object — mutations will throw in strict mode.
 */
export function lookupType(typ: string): TypeDefinition | undefined {
  return registry.get(typ.toLowerCase());
}

/**
 * Get all registered type identifiers, sorted alphabetically.
 */
export function registeredTypes(): string[] {
  return Array.from(registry.keys()).sort();
}

/**
 * Register a custom type definition.
 * Cannot override built-in spec types — only new types or previously user-registered types.
 */
export function registerType(def: TypeDefinition): void {
  const key = def.type.toLowerCase();
  if (builtinTypes.has(key)) {
    throw new Error(`cannot override built-in type "${key}"`);
  }
  registry.set(key, deepFreeze(structuredClone(def)));
}

// Helper to define types concisely
function defType(
  type: string,
  typeName: string,
  description: string,
  opts: {
    repo?: string;
    ns?: Requirement;
    nsCaseSensitive?: boolean;
    nameCaseSensitive?: boolean;
    nameNormRules?: string[];
    versionCaseSensitive?: boolean;
    subpath?: Requirement;
    qualifiers?: QualifierDefinition[];
    examples?: string[];
  } = {}
): void {
  const def: TypeDefinition = {
    type,
    typeName,
    description,
    repository: {
      useRepository: !!opts.repo || opts.repo === undefined,
      defaultRepositoryUrl: opts.repo,
    },
    namespace: {
      requirement: opts.ns ?? 'optional',
      caseSensitive: opts.nsCaseSensitive ?? true,
    },
    name: {
      requirement: 'required',
      caseSensitive: opts.nameCaseSensitive ?? true,
      normalizationRules: opts.nameNormRules,
    },
    version: {
      requirement: 'optional',
      caseSensitive: opts.versionCaseSensitive ?? true,
    },
    subpath: opts.subpath
      ? { requirement: opts.subpath, caseSensitive: true }
      : undefined,
    qualifiers: opts.qualifiers,
    examples: opts.examples ?? [],
  };
  registry.set(type, deepFreeze(def));
  builtinTypes.add(type);
}

// Register all 39 PURL types from the spec

defType('alpm', 'Arch Linux packages', 'Arch Linux packages', {
  repo: 'https://archlinux.org/packages',
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
});

defType('apk', 'APK packages', 'APK-based packages', {
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
});

defType('bazel', 'Bazel modules', 'Bazel modules from BCR', {
  repo: 'https://bcr.bazel.build',
  ns: 'prohibited',
  subpath: 'optional',
});

defType('bitbucket', 'Bitbucket', 'Bitbucket-based packages', {
  repo: 'https://bitbucket.org',
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
});

defType('bitnami', 'Bitnami', 'Bitnami packages', {
  repo: 'https://downloads.bitnami.com/files/stacksmith',
  ns: 'prohibited',
  nameCaseSensitive: false,
});

defType('cargo', 'Cargo', 'Rust Cargo packages', {
  repo: 'https://crates.io/',
  ns: 'prohibited',
  nameCaseSensitive: true,
});

defType('cocoapods', 'CocoaPods', 'CocoaPods packages', {
  repo: 'https://cdn.cocoapods.org/',
  ns: 'optional',
});

defType('composer', 'Composer', 'PHP Composer packages', {
  repo: 'https://packagist.org',
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
});

defType('conan', 'Conan', 'C/C++ Conan packages', {
  repo: 'https://center.conan.io',
  ns: 'optional',
  qualifiers: [
    { key: 'user', requirement: 'optional' },
    { key: 'channel', requirement: 'optional' },
    { key: 'rrev', requirement: 'optional' },
    { key: 'prev', requirement: 'optional' },
  ],
});

defType('conda', 'Conda', 'Conda packages', {
  repo: 'https://repo.anaconda.com',
  ns: 'optional',
});

defType('cpan', 'CPAN', 'Perl CPAN packages', {
  repo: 'https://www.cpan.org',
  ns: 'required',
});

defType('cran', 'CRAN', 'R packages', {
  repo: 'https://cran.r-project.org',
  ns: 'prohibited',
});

defType('deb', 'Debian', 'Debian packages', {
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
  qualifiers: [
    { key: 'arch', requirement: 'optional' },
    { key: 'distro', requirement: 'optional' },
  ],
});

defType('docker', 'Docker', 'Docker images', {
  repo: 'https://hub.docker.com',
  ns: 'optional',
});

defType('gem', 'RubyGems', 'Ruby gems', {
  repo: 'https://rubygems.org',
  ns: 'optional',
});

defType('generic', 'Generic', 'Generic packages', {
  ns: 'optional',
});

defType('github', 'GitHub', 'GitHub-based packages', {
  repo: 'https://github.com',
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
});

defType('golang', 'Go', 'Go packages', {
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
  subpath: 'optional',
});

defType('hackage', 'Hackage', 'Haskell packages', {
  repo: 'https://hackage.haskell.org',
  ns: 'optional',
});

defType('hex', 'Hex', 'Hex packages', {
  repo: 'https://repo.hex.pm',
  ns: 'optional',
});

defType('huggingface', 'Hugging Face', 'Hugging Face models', {
  repo: 'https://huggingface.co',
  ns: 'required',
  nsCaseSensitive: true,
  nameCaseSensitive: true,
  versionCaseSensitive: false,
});

defType('julia', 'Julia', 'Julia packages', {
  repo: 'https://juliahub.com',
  ns: 'prohibited',
  qualifiers: [{ key: 'uuid', requirement: 'required' }],
});

defType('luarocks', 'LuaRocks', 'Lua packages', {
  repo: 'https://luarocks.org',
  ns: 'optional',
});

defType('maven', 'Maven', 'Maven JARs and artifacts', {
  repo: 'https://repo.maven.apache.org/maven2/',
  ns: 'required',
  nsCaseSensitive: true,
  nameCaseSensitive: true,
  qualifiers: [
    { key: 'classifier', requirement: 'optional' },
    { key: 'type', requirement: 'optional', defaultValue: 'jar' },
  ],
});

defType('mlflow', 'MLflow', 'MLflow models', {
  ns: 'prohibited',
  nameCaseSensitive: false,
});

defType('npm', 'npm', 'Node npm packages', {
  repo: 'https://registry.npmjs.org/',
  ns: 'optional',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
});

defType('nuget', 'NuGet', '.NET NuGet packages', {
  repo: 'https://www.nuget.org',
  ns: 'prohibited',
  nameCaseSensitive: true,
});

defType('oci', 'OCI', 'OCI container images', {
  ns: 'prohibited',
  nameCaseSensitive: false,
  qualifiers: [
    { key: 'arch', requirement: 'optional' },
    { key: 'repository_url', requirement: 'optional' },
    { key: 'tag', requirement: 'optional' },
  ],
});

defType('opam', 'opam', 'OCaml packages', {
  repo: 'https://opam.ocaml.org',
  ns: 'optional',
});

defType('otp', 'OTP', 'Erlang/OTP applications', {
  ns: 'prohibited',
  nameCaseSensitive: false,
  subpath: 'optional',
  qualifiers: [
    { key: 'repository_url', requirement: 'optional' },
    { key: 'platform', requirement: 'optional' },
    { key: 'arch', requirement: 'optional' },
  ],
});

defType('pub', 'Pub', 'Dart/Flutter pub packages', {
  repo: 'https://pub.dartlang.org',
  ns: 'optional',
});

defType('pypi', 'PyPI', 'Python packages', {
  repo: 'https://pypi.org',
  ns: 'prohibited',
  nameCaseSensitive: false,
  nameNormRules: ['Replace underscore _ with dash -'],
  qualifiers: [{ key: 'file_name', requirement: 'optional' }],
});

defType('qpkg', 'QPKG', 'QNX packages', {
  ns: 'optional',
});

defType('rpm', 'RPM', 'RPM packages', {
  ns: 'required',
  qualifiers: [
    { key: 'arch', requirement: 'optional' },
    { key: 'epoch', requirement: 'optional' },
    { key: 'distro', requirement: 'optional' },
  ],
});

defType('swid', 'SWID', 'ISO SWID tags', {
  ns: 'optional',
  qualifiers: [
    { key: 'tag_id', requirement: 'required' },
    { key: 'tag_version', requirement: 'optional', defaultValue: '0' },
    { key: 'patch', requirement: 'optional', defaultValue: 'false' },
    { key: 'tag_creator_name', requirement: 'optional' },
    { key: 'tag_creator_regid', requirement: 'optional' },
  ],
});

defType('swift', 'Swift', 'Swift packages', {
  ns: 'required',
  nsCaseSensitive: true,
  nameCaseSensitive: true,
});

defType('vscode-extension', 'VS Code Extension', 'VS Code extensions', {
  repo: 'https://marketplace.visualstudio.com/vscode-extension',
  ns: 'required',
  nsCaseSensitive: false,
  nameCaseSensitive: false,
  versionCaseSensitive: false,
});

defType('yocto', 'Yocto', 'Yocto Project recipes', {
  ns: 'required',
});
