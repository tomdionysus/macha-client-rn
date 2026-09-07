/**
 * Whether the cluster is reachable, as one app-wide fact.
 *
 * Being away from your own network is an ordinary condition for a phone, not
 * an error, so this is a state the whole app reads rather than something each
 * screen discovers by failing. It is set by the API layer when a request fails
 * at the transport level, and cleared as soon as any request succeeds.
 */
export class Connectivity {
  private offline = false;
  private readonly listeners = new Set<() => void>();
  private lastChangedAt = 0;
  private lastProbeAt = 0;

  get isOffline(): boolean {
    return this.offline;
  }

  /** When the state last flipped — used to avoid re-probing a node too eagerly. */
  get changedAt(): number {
    return this.lastChangedAt;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Whether a caller should attempt the network.
   *
   * Online, always. Offline, only occasionally — otherwise every screen pays a
   * full request timeout before showing the downloads it could have shown
   * instantly, which is precisely the experience offline mode exists to avoid.
   */
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
