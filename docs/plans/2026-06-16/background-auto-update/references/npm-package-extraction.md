# External Reference: npm Package Extraction

## Purpose

Fetch the latest published Apollo Toolkit package contents so background updates can refresh managed skills without updating the globally installed CLI binary.

## External Method: pacote

- **Source**: https://github.com/npm/pacote
- **Purpose**: Resolve and extract npm package specs in-process.
- **Candidate dependency**: `pacote`
- **Expected license**: npm/pacote is distributed as open source from the npm organization; confirm exact SPDX expression during implementation before adding to `package.json`.

## Required Methods

### `pacote.manifest(spec, opts)`

- **Purpose**: Read published package metadata such as version before deciding whether to update.
- **Parameters**
  - `spec: string` - package specifier such as `@laitszkin/apollo-toolkit@latest`.
  - `opts: object` - npm registry/auth/cache options if needed.

### `pacote.extract(spec, dest, opts)`

- **Purpose**: Extract a package tarball into a temporary directory.
- **Parameters**
  - `spec: string` - package specifier such as `@laitszkin/apollo-toolkit@latest`.
  - `dest: string` - temporary destination directory.
  - `opts: object` - npm registry/auth/cache options if needed.
- **Return shape**: Promise resolving extraction metadata including resolved package information.

## Design Obligations

- Extract into a temporary directory first; never partially overwrite `~/.apollo-toolkit`.
- Validate extracted contents contain expected Apollo Toolkit skill directories before syncing targets.
- Preserve the existing installer's managed-skill ownership boundary.
- Treat network, registry, and extraction failures as non-blocking background update failures with persisted status.
