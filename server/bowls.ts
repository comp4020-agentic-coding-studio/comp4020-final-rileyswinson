// What's in each stall's toilet. It belongs to the stall, not to whoever is
// in it: the next person in finds what the last one left.

export type Poop = { x: number; z: number; w: number; d: number };
export type Bowl = { piss: number; poops: Poop[] };
export type BowlUse = "piss" | "shit" | "half" | "full";

const MAX_PISS = 3; // the water can only get so yellow
const MAX_POOPS = 10;

export const emptyBowl = (): Bowl => ({ piss: 0, poops: [] });

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// Positions are in cm from the middle of the water, chosen here so everyone
// who looks sees the same thing.
export function useBowl(bowl: Bowl, kind: BowlUse): void {
  if (kind === "piss") {
    bowl.piss = Math.min(MAX_PISS, bowl.piss + 1);
  } else if (kind === "shit") {
    const n = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < n && bowl.poops.length < MAX_POOPS; i++) {
      bowl.poops.push({ x: between(-6, 6), z: between(-9, 9), w: between(3, 4.5), d: between(5, 9) });
    }
  } else {
    // any flush clears the water; only a full one takes the solids
    bowl.piss = 0;
    if (kind === "full") bowl.poops = [];
  }
}
