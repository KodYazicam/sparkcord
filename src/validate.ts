import { loadCommands } from "./loaders/files.js";
import { CommandRegistry } from "./handlers/registry.js";
import { isKnownPermission } from "./utils/discord-permissions.js";
import type { CommandDefinition, CommandOption } from "./types.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

const NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const OPTION_TYPES = new Set(["string", "integer", "boolean", "user", "channel", "role", "number"]);
// Discord's application-command limits. Violating any of them makes
// commands.set() fail with 50035 and silently drops every command, so
// validate must catch them before the bot starts.
const CHOICE_TYPES = new Set(["string", "integer", "number"]);
const MAX_OPTIONS = 25;
const MAX_CHOICES = 25;
const MAX_TEXT = 100;

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
  } else if (typeof option.description === "string" && option.description.length > MAX_TEXT) {
    issues.push({
      path,
      message: `${where} description is ${option.description.length} chars; Discord allows at most ${MAX_TEXT}`,
    });
  }
  if (option.type !== undefined && !OPTION_TYPES.has(option.type)) {
    issues.push({
      path,
      message: `${where} has unknown type ${JSON.stringify(option.type)} (allowed: ${[...OPTION_TYPES].join(", ")})`,
    });
  }
  if (option.choices === undefined) return;
  if (!Array.isArray(option.choices)) {
    issues.push({ path, message: `${where} choices must be an array` });
    return;
  }
  if (option.choices.length > MAX_CHOICES) {
    issues.push({
      path,
      message: `${where} has ${option.choices.length} choices; Discord allows at most ${MAX_CHOICES}`,
    });
  }
  if (option.type !== undefined && OPTION_TYPES.has(option.type) && !CHOICE_TYPES.has(option.type)) {
    issues.push({
      path,
      message: `${where} cannot carry choices: Discord only allows them on string, integer, and number options`,
    });
  }
  for (const choice of option.choices) {
    if (typeof choice?.name !== "string" || !choice.name) {
      issues.push({ path, message: `${where} has a choice without a name` });
    } else if (choice.name.length > MAX_TEXT) {
      issues.push({
        path,
        message: `${where} has a choice name of ${choice.name.length} chars; Discord allows at most ${MAX_TEXT}`,
      });
    }
    if (typeof choice?.value !== "string" && typeof choice?.value !== "number") {
      issues.push({ path, message: `${where} has a choice value that is not a string or number` });
    } else if (typeof choice.value === "string" && choice.value.length > MAX_TEXT) {
      issues.push({
        path,
        message: `${where} has a choice value of ${choice.value.length} chars; Discord allows at most ${MAX_TEXT}`,
      });
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
  } else if (Array.isArray(definition.permissions)) {
    for (const name of definition.permissions) {
      if (typeof name !== "string" || !isKnownPermission(name)) {
        issues.push({
          path,
          message: `unknown Discord permission ${JSON.stringify(name)} in permissions`,
        });
      }
    }
  }
  for (const alias of definition.aliases ?? []) {
    if (typeof alias !== "string" || !alias || alias !== alias.toLowerCase()) {
      issues.push({ path, message: `aliases must be non-empty lowercase strings (got ${JSON.stringify(alias)})` });
    }
  }
  if (definition.options !== undefined && !Array.isArray(definition.options)) {
    issues.push({ path, message: "options must be an array" });
  } else if (Array.isArray(definition.options)) {
    if (definition.options.length > MAX_OPTIONS) {
      issues.push({
        path,
        message: `command has ${definition.options.length} options; Discord allows at most ${MAX_OPTIONS}`,
      });
    }
    // Discord rejects the whole payload when a required option follows an
    // optional one, so report every offender instead of the first.
    let sawOptional = false;
    for (const option of definition.options) {
      checkOption(option, path, issues);
      if (option?.required === true) {
        if (sawOptional) {
          issues.push({
            path,
            message: `${path} option ${JSON.stringify(option.name ?? "")} is required but comes after an optional option; Discord requires required options first`,
          });
        }
      } else {
        sawOptional = true;
      }
    }
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
