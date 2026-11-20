import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Canonical path when it exists; a plain absolute path otherwise. */
function canonicalPath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
}

export function invokedDirectly(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    // npm installs package bin entries as symlinks. Node resolves the main
    // module (import.meta.url) to the real file but keeps process.argv[1] on
    // the link path, so a lexical comparison silently disables the CLI.
    return canonicalPath(fileURLToPath(metaUrl)) === canonicalPath(entry);
  } catch {
    try {
      return new URL(metaUrl).href === pathToFileURL(entry).href;
    } catch {
      return false;
    }
  }
}
