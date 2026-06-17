#!/usr/bin/env node

import { run } from '@laitszkin/cli';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

run(process.argv.slice(2), { sourceRoot })
  .then((code: number) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  });
