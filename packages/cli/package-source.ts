import path from 'node:path';
import fsp from 'node:fs/promises';

/**
 * PackageSource abstracts fetching and extracting npm package contents.
 *
 * Used by the auto-update runner to resolve the latest published version
 * and extract its contents to a temporary directory without touching the
 * globally installed CLI package.
 */
export interface PackageSource {
  /**
   * Resolve the latest published version for a package name.
   * Returns the version string and a specifier suitable for extract().
   */
  resolveLatest(packageName: string): Promise<{ version: string; spec: string }>;

  /**
   * Extract the package identified by `spec` (e.g. "pkg@1.2.3") into
   * the `destination` directory. The destination should be a freshly
   * created empty directory.
   *
   * Returns the version (read from extracted package.json if available)
   * and the root path where the package contents were extracted.
   */
  extract(spec: string, destination: string): Promise<{ version?: string; sourceRoot: string }>;
}

/**
 * Optional injected functions for testing or customising a pacote-backed
 * PackageSource. When provided these replace the corresponding pacote
 * calls, avoiding the need for the real `pacote` dependency in tests.
 */
export interface PackageSourceOptions {
  /** Optional replacement for pacote.manifest(spec, opts). */
  manifest?: (spec: string, opts?: Record<string, unknown>) => Promise<{ version: string }>;
  /** Optional replacement for pacote.extract(spec, dest, opts). */
  extract?: (spec: string, dest: string, opts?: Record<string, unknown>) => Promise<void>;
}

/**
 * Create a default PackageSource backed by the `pacote` npm package.
 *
 * Uses lazy dynamic import so that the module can be imported before
 * `pacote` is installed.  The import will only fail at runtime when
 * resolveLatest() or extract() is first called.
 *
 * @param options  Optional injected functions for testing (skip real pacote).
 */
export function createPacotePackageSource(options?: PackageSourceOptions): PackageSource {
  return {
    async resolveLatest(packageName) {
      if (options?.manifest) {
        const result = await options.manifest(`${packageName}@latest`, { fullMetadata: false });
        return { version: result.version, spec: `${packageName}@${result.version}` };
      }
      // Lazy dynamic import — pacote is not a build-time dependency yet.
      // @ts-expect-error - pacote dependency added by T4.1; safe at runtime
      const pacote: any = await import('pacote');
      const manifest = await pacote.manifest(`${packageName}@latest`, { fullMetadata: false });
      return { version: manifest.version, spec: `${packageName}@${manifest.version}` };
    },

    async extract(spec, destination) {
      if (options?.extract) {
        await options.extract(spec, destination);
      } else {
        // @ts-expect-error - pacote dependency added by T4.1; safe at runtime
        const pacote: any = await import('pacote');
        await pacote.extract(spec, destination);
      }

      // Try to read the version from the extracted package.json.
      let version: string | undefined;
      try {
        const raw = await fsp.readFile(path.join(destination, 'package.json'), 'utf8');
        const pkg = JSON.parse(raw) as { version?: string };
        version = pkg.version;
      } catch {
        // Non-critical — version stays undefined.
      }

      return { version, sourceRoot: destination };
    },
  };
}
