export type InteractionKind = "slash" | "button" | "select" | "modal" | "autocomplete" | "unknown";

export function interactionKind(raw: unknown): InteractionKind {
  const ix = raw as {
    isChatInputCommand?: () => boolean;
    isButton?: () => boolean;
    isStringSelectMenu?: () => boolean;
    isModalSubmit?: () => boolean;
    isAutocomplete?: () => boolean;
    type?: number;
  };
  if (typeof ix.isChatInputCommand === "function" && ix.isChatInputCommand()) return "slash";
  if (typeof ix.isButton === "function" && ix.isButton()) return "button";
  if (typeof ix.isStringSelectMenu === "function" && ix.isStringSelectMenu()) return "select";
  if (typeof ix.isModalSubmit === "function" && ix.isModalSubmit()) return "modal";
  if (typeof ix.isAutocomplete === "function" && ix.isAutocomplete()) return "autocomplete";
  if (ix.type === 2) return "slash";
  if (ix.type === 3) return "button";
  if (ix.type === 4) return "autocomplete";
  if (ix.type === 5) return "modal";
  return "unknown";
}

export function customIdHead(raw: unknown): string | null {
  const id = (raw as { customId?: string }).customId;
  if (!id || typeof id !== "string") return null;
  const head = id.split("_")[0];
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(head)) return null;
  return head.toLowerCase();
}

export type ComponentHandler = {
  customId: string;
  run: (ctx: { raw: unknown; customId: string; args: string[]; bot: unknown }) => unknown | Promise<unknown>;
};

export type AutocompleteHandler = {
  command: string;
  run: (ctx: { raw: unknown; focused: string; bot: unknown }) => unknown | Promise<unknown>;
};

export class InteractionRouter {
  readonly components = new Map<string, ComponentHandler>();
  readonly autocomplete = new Map<string, AutocompleteHandler>();

  onComponent(handler: ComponentHandler): this {
    this.components.set(handler.customId.toLowerCase(), handler);
    return this;
  }

  onAutocomplete(handler: AutocompleteHandler): this {
    this.autocomplete.set(handler.command.toLowerCase(), handler);
    return this;
  }

  async dispatch(raw: unknown, bot: unknown): Promise<{ ok: boolean; reason?: string; value?: unknown }> {
    const kind = interactionKind(raw);
    if (kind === "autocomplete") {
      const name = String((raw as { commandName?: string }).commandName ?? "").toLowerCase();
      const handler = this.autocomplete.get(name);
      if (!handler) return { ok: false, reason: "no-autocomplete" };
      const focused = String((raw as { options?: { getFocused?: (v?: boolean) => unknown } }).options?.getFocused?.(true) ?? "");
      const value = await handler.run({ raw, focused, bot });
      return { ok: true, value };
    }
    if (kind === "button" || kind === "select" || kind === "modal") {
      const head = customIdHead(raw);
      if (!head) return { ok: false, reason: "bad-custom-id" };
      const handler = this.components.get(head);
      if (!handler) return { ok: false, reason: "no-component" };
      const customId = String((raw as { customId: string }).customId);
      const args = customId.split("_").slice(1);
      const value = await handler.run({ raw, customId, args, bot });
      return { ok: true, value };
    }
    return { ok: false, reason: kind };
  }
}
