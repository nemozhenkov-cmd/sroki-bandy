import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function stampWorker(source, buildId) {
  if (!source.includes('__SROKI_BUILD__')) throw new Error('Missing service worker build marker');
  return source.replace('__SROKI_BUILD__', buildId);
}

// The worker body must change on every publication, even for UI-only changes.
// An old cached client checks its old script URL; a query in new JS cannot rescue it.
export function versionedWorker(buildId) {
  let outputDir;
  return {
    name: 'versioned-offline-worker',
    apply: 'build',
    configResolved(config) { outputDir = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      const path = resolve(outputDir, 'sw.js');
      await writeFile(path, stampWorker(await readFile(path, 'utf8'), buildId));
    }
  };
}
