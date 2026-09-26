import { loadCommands } from "./loaders/files.js";
import { CommandRegistry } from "./handlers/registry.js";
import type { CommandDefinition, CommandOption } from "./types.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

const NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const OPTION_TYPES = new Set(["string", "integer", "boolean", "user", "channel", "role", "number"]);

function checkOption(option: CommandOption, path: string, issues: ValidationIssue[]): void {
  const where = `${path} option ${JSON.stringify(option?.name ?? "")}`;
  if (!option || typeof option !== "object") {
    issues.push({ path, message: "option entry is not an object" });
    return;
  }
  if (!option.name || !NAME_PATTERN.test(option.name)) {
    issues.push({ path, message: `${where} needs a lowercase name of 1-32 chars [a-z0-9_-]` });
  }
  if (!option.description) {
    issues.push({ path, message: `${where} needs a description` });
  }
  if (option.type !== undefined && !OPTION_TYPES.has(option.type)) {
    issues.push({
      path,
      message: `${where} has unknown type ${JSON.stringify(option.type)} (allowed: ${[...OPTION_TYPES].join(", ")})`,
    });
  }
  for (const choice of option.choices ?? []) {
    if (typeof choice?.name !== "string" || !choice.name) {
      issues.push({ path, message: `${where} has a choice without a name` });
    }
    if (typeof choice?.value !== "string" && typeof choice?.value !== "number") {
      issues.push({ path, message: `${where} has a choice value that is not a string or number` });
    }
  }
}

/** Static checks on one command definition. No Discord token, no client, no run(). */
export function validateDefinition(definition: CommandDefinition, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!definition || typeof definition !== "object") {
    return [{ path, message: "module must export a command object" }];
  }
  if (!definition.name || !NAME_PATTERN.test(definition.name)) {
    issues.push({ path, message: `name must be 1-32 chars of [a-z0-9_-] (got ${JSON.stringify(definition.name)})` });
  }
  if (!definition.description || definition.description.length > 100) {
    issues.push({
      path,
      message: `description is required and must be 1-100 chars (got ${definition.description?.length ?? 0})`,
    });
  }
  if (definition.kind !== undefined && !["slash", "prefix", "both"].includes(definition.kind)) {
    issues.push({ path, message: `kind must be slash, prefix, or both (got ${JSON.stringify(definition.kind)})` });
  }
  if (definition.cooldown !== undefined && (!Number.isFinite(definition.cooldown) || definition.cooldown <= 0)) {
    issues.push({ path, message: `cooldown must be a positive number of seconds (got ${JSON.stringify(definition.cooldown)})` });
  }
  if (definition.guildOnly !== undefined && typeof definition.guildOnly !== "boolean") {
    issues.push({ path, message: "guildOnly must be a boolean" });
  }
  if (definition.ownerOnly !== undefined && typeof definition.ownerOnly !== "boolean") {
    issues.push({ path, message: "ownerOnly must be a boolean" });
  }
  if (definition.permissions !== undefined && !Array.isArray(definition.permissions)) {
    issues.push({ path, message: "permissions must be an array of permission names" });
  }
  for (const alias of definition.aliases ?? []) {
    if (typeof alias !== "string" || !alias || alias !== alias.toLowerCase()) {
      issues.push({ path, message: `aliases must be non-empty lowercase strings (got ${JSON.stringify(alias)})` });
    }
  }
  if (definition.options !== undefined && !Array.isArray(definition.options)) {
    issues.push({ path, message: "options must be an array" });
  } else if (Array.isArray(definition.options)) {
    for (const option of definition.options) checkOption(option, path, issues);
  }
  if (typeof definition.run !== "function") {
    issues.push({ path, message: "run must be a function" });
  }
  return issues;
}

export interface ValidateResult {
  issues: ValidationIssue[];
  commands: number;
}

/**
 * Loads a commands directory exactly like SparkBot.load() would (real imports,
 * real module unwrapping), then applies static checks and duplicate detection.
 * Never touches Discord.
 */
export async function validateCommands(
  dir: string,
  importer?: (url: string) => Promise<unknown>,
): Promise<ValidateResult> {
  let loaded;
  try {
    loaded = await loadCommands(dir, importer);
  } catch (error) {
    return { issues: [{ path: dir, message: (error as Error).message }], commands: 0 };
  }
  const issues: ValidationIssue[] = [];
  for (const command of loaded) {
    issues.push(...validateDefinition(command.definition, command.path));
  }
  const registry = new CommandRegistry();
  for (const command of loaded) {
    try {
      registry.register(command);
    } catch (error) {
      issues.push({ path: command.path, message: (error as Error).message });
    }
  }
  return { issues, commands: loaded.length };
}
