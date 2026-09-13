export class CooldownStore {
  private readonly hits = new Map<string, number>();

  remaining(key: string, seconds: number, now = Date.now()): number {
    this.gc(now);
    const until = this.hits.get(key) ?? 0;
    const left = until - now;
    if (left > 0) return left;
    this.hits.set(key, now + seconds * 1000);
    return 0;
  }

  clear(key?: string): void {
    if (key) this.hits.delete(key);
    else this.hits.clear();
  }

  get size(): number {
    return this.hits.size;
  }

  private gc(now: number): void {
    if (this.hits.size < 500) return;
    for (const [key, until] of this.hits) {
      if (until <= now) this.hits.delete(key);
    }
  }
}

export function cooldownKey(command: string, userId: string): string {
  return `${command}:${userId}`;
}
