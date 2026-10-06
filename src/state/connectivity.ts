/**
 * Whether the cluster is reachable, as one app-wide fact. Set by the API layer
 * on a transport failure and cleared by any success.
 */
export class Connectivity {
  private offline = false;
  private readonly listeners = new Set<() => void>();
  private lastChangedAt = 0;
  private lastProbeAt = 0;

  get isOffline(): boolean {
    return this.offline;
  }

  /** When the state last flipped, used to avoid re-probing a node too eagerly. */
  get changedAt(): number {
    return this.lastChangedAt;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Whether to attempt the network: always online, once per interval offline, so screens do not wait out timeouts. */
  shouldProbe(intervalMs = 20_000): boolean {
    if (!this.offline) return true;
    const now = Date.now();
    if (now - this.lastProbeAt < intervalMs) return false;
    this.lastProbeAt = now;
    return true;
  }

  reportUnreachable(): void {
    this.set(true);
  }

  reportReachable(): void {
    this.set(false);
  }

  private set(offline: boolean): void {
    if (this.offline === offline) return;
    this.offline = offline;
    this.lastChangedAt = Date.now();
    for (const listener of this.listeners) listener();
  }
}
