import type { CommandDefinition, LoadedCommand } from "../types.js";

export class CommandRegistry {
  private readonly byName = new Map<string, LoadedCommand>();
  private readonly aliases = new Map<string, string>();

  register(command: LoadedCommand): void {
    const name = command.definition.name.toLowerCase();
    if (this.byName.has(name)) {
      throw new Error(`Duplicate command: ${name}`);
    }
    const aliasOwner = this.aliases.get(name);
    if (aliasOwner) {
      throw new Error(`Duplicate command: ${name} (already an alias of ${aliasOwner})`);
    }
    const aliases = command.definition.aliases;
    if (aliases !== undefined && !Array.isArray(aliases)) {
      throw new Error(`Invalid aliases for ${name}: expected an array of lowercase names`);
    }
    // Collect and validate every alias before writing anything, so a rejected
    // registration leaves neither the command nor a partial alias set behind.
    const keys: string[] = [];
    for (const alias of aliases ?? []) {
      if (typeof alias !== "string") {
        throw new Error(`Invalid alias for ${name}: expected a string`);
      }
      const key = alias.toLowerCase();
      if (key === name || this.byName.has(key) || this.aliases.has(key) || keys.includes(key)) {
        throw new Error(`Duplicate alias: ${alias}`);
      }
      keys.push(key);
    }
    this.byName.set(name, command);
    for (const key of keys) this.aliases.set(key, name);
  }

  resolve(name: string): LoadedCommand | undefined {
    const key = name.toLowerCase();
    const direct = this.byName.get(key);
    if (direct) return direct;
    const aliased = this.aliases.get(key);
    return aliased ? this.byName.get(aliased) : undefined;
  }

  all(): LoadedCommand[] {
    return [...this.byName.values()];
  }

  slashable(): CommandDefinition[] {
    return this.all()
      .map((c) => c.definition)
      .filter((c) => (c.kind ?? "both") !== "prefix");
  }

  prefixable(name: string): LoadedCommand | undefined {
    const found = this.resolve(name);
    if (!found) return undefined;
    const kind = found.definition.kind ?? "both";
    return kind === "slash" ? undefined : found;
  }
}
