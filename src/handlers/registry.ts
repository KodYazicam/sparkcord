import type { CommandDefinition, LoadedCommand } from "../types.js";

export class CommandRegistry {
  private readonly byName = new Map<string, LoadedCommand>();
  private readonly aliases = new Map<string, string>();

  register(command: LoadedCommand): void {
    const name = command.definition.name.toLowerCase();
    if (this.byName.has(name)) {
      throw new Error(`Duplicate command: ${name}`);
    }
    this.byName.set(name, command);
    for (const alias of command.definition.aliases ?? []) {
      const key = alias.toLowerCase();
      if (this.aliases.has(key) || this.byName.has(key)) {
        throw new Error(`Duplicate alias: ${alias}`);
      }
      this.aliases.set(key, name);
    }
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
