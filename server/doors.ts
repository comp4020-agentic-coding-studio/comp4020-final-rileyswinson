// The stalls. The server is the only authority on who is in which stall:
// clients ask to enter, and only the server's answer moves anyone inside.

export type DoorView = {
  occupied: boolean;
  // epoch ms when the timer swings the door open again; null while vacant
  opensAt: number | null;
};

type Stall = { occupant: string | null; opensAt: number | null; timer?: NodeJS.Timeout };

export type DoorsOptions = {
  count: number;
  // how long one visit lasts before the door opens on its own, like a
  // public toilet's timed lock
  maxStayMs: number;
  // called whenever the state changes, with whoever was evicted (if anyone)
  onChange: (evicted?: { clientId: string; door: number }) => void;
};

export class Doors {
  private stalls: Stall[];
  private opts: DoorsOptions;

  constructor(opts: DoorsOptions) {
    this.opts = opts;
    this.stalls = Array.from({ length: opts.count }, () => ({ occupant: null, opensAt: null }));
  }

  view(): DoorView[] {
    return this.stalls.map((s) => ({ occupied: s.occupant !== null, opensAt: s.opensAt }));
  }

  doorOf(clientId: string): number | null {
    const i = this.stalls.findIndex((s) => s.occupant === clientId);
    return i === -1 ? null : i;
  }

  // First claim wins. A client already in a stall can't hold a second one.
  enter(clientId: string, door: number): boolean {
    const stall = this.stalls[door];
    if (!stall || stall.occupant !== null || this.doorOf(clientId) !== null) return false;
    stall.occupant = clientId;
    stall.opensAt = Date.now() + this.opts.maxStayMs;
    stall.timer = setTimeout(() => {
      this.vacate(door);
      this.opts.onChange({ clientId, door });
    }, this.opts.maxStayMs);
    this.opts.onChange();
    return true;
  }

  leave(clientId: string): void {
    const door = this.doorOf(clientId);
    if (door === null) return;
    this.vacate(door);
    this.opts.onChange();
  }

  private vacate(door: number): void {
    const stall = this.stalls[door];
    clearTimeout(stall.timer);
    stall.occupant = null;
    stall.opensAt = null;
    stall.timer = undefined;
  }
}
