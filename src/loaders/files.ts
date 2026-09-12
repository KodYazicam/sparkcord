import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { CommandDefinition, EventDefinition, LoadedCommand, LoadedEvent } from "../types.js";

const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts"]);

export function listModules(dir: string): string[] {
  const out: string[] = [];
  walk(dir, out);
  return out.sort();
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!CODE_EXT.has(extname(name))) continue;
    if (name.endsWith(".d.ts") || name.endsWith(".test.ts") || name.endsWith(".spec.ts")) continue;
    out.push(abs);
  }
}

export function unwrapModule<T>(mod: Record<string, unknown>): T {
  const candidate = (mod.default ?? mod.command ?? mod.event ?? mod) as T | { default?: T };
  if (candidate && typeof candidate === "object" && "default" in (candidate as object)) {
    return (candidate as { default: T }).default;
  }
  return candidate as T;
}

export async function loadCommands(dir: string, importer?: (url: string) => Promise<unknown>): Promise<LoadedCommand[]> {
  const importFn = importer ?? ((url: string) => import(url));
  const loaded: LoadedCommand[] = [];
  for (const file of listModules(dir)) {
    const mod = (await importFn(pathToFileURL(file).href)) as Record<string, unknown>;
    const definition = unwrapModule<CommandDefinition>(mod);
    if (!definition?.name || typeof definition.run !== "function") {
      throw new Error(`Invalid command module: ${file}`);
    }
    loaded.push({ definition, path: file });
  }
  return loaded;
}

export async function loadEvents(dir: string, importer?: (url: string) => Promise<unknown>): Promise<LoadedEvent[]> {
  const importFn = importer ?? ((url: string) => import(url));
  const loaded: LoadedEvent[] = [];
  for (const file of listModules(dir)) {
    const mod = (await importFn(pathToFileURL(file).href)) as Record<string, unknown>;
    const definition = unwrapModule<EventDefinition>(mod);
    if (!definition?.name || typeof definition.run !== "function") {
      throw new Error(`Invalid event module: ${file}`);
    }
    loaded.push({ definition, path: file });
  }
  return loaded;
}
