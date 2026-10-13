// What each stall holds: what's in its toilet, everything that's been put on
// every surface in it (lines and stickers, in the order they went on), and
// the pile of stickers under the bowl. And what's shared between them: every
// sticker anyone has made and who made it, what each person is carrying, and
// what's stuck on the outside of the doors. It belongs to the place, not to
// whoever is in it, and it survives a restart: the lot is written to the
// data volume.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyBowl, useBowl, type Bowl, type BowlUse } from "./bowls.ts";
import { DEFAULT_STICKERS, starterPile } from "./defaults.ts";

// a line on one face: what it was drawn with, its colour, its width in cm,
// and its points as a flat list of face-local cm, x then y
export type Kind = "pen" | "marker" | "spray";
export type Stroke = { k: Kind; c: string; w: number; p: number[] };
// a sticker stuck on a face: which one, where (cm), how askew, how big
export type Stuck = { id: string; u: number; v: number; r: number; s: number };
// a face holds both, one list, oldest first: later ones go over earlier ones
export type Mark = Stroke | Stuck;
// a wad of copies of one sticker in the pile
export type Wad = { id: string; left: number };
export type Stall = { bowl: Bowl; marks: Record<string, Mark[]>; pile: Wad[] };
// a sticker on the outside of a door: where as fractions of the door
export type Outside = { id: string; u: number; v: number; r: number };
export type Pocket = Record<string, number>;
type Saved = { stalls: Stall[]; outside: Outside[][]; makers?: Record<string, string>; pockets?: Record<string, Pocket> };
// how a stall was saved before lines and stickers shared a list
type OldStall = { bowl: Bowl; strokes?: Record<string, Stroke[]>; placed?: Record<string, Stuck[]>; pile?: Wad[] };

// the markers on offer; a stroke in any other colour is refused
export const INKS = new Set([
  "#111111", "#e8e4d8", "#d7263d", "#1b6ef3", "#19a85a",
  "#f2c200", "#ff5fa2", "#ff7a1a", "#8a2be2", "#6b4a2b",
]);
export const KINDS = new Set<Kind>(["pen", "marker", "spray"]);
// the pen and the marker come fine or fat; the spray is only ever wide
const NIBS: Record<Kind, number[]> = { pen: [0.5, 1.2], marker: [0.5, 1.2], spray: [15] };

const MAX_POINTS = 4000; // per stroke
const MAX_MARKS_PER_FACE = 2000; // after that the oldest go under the newest
const MAX_MARKS_PER_STALL = 8000;
const FACE_NAME = /^[a-z-]+(\/[a-z0-9-]+)?$/;

const WAD = 10; // copies in a wad
const MAX_WADS = 20; // the pile can only get so tall before it meets the bowl
const STICKER_CM = 12;
const MAX_OUTSIDE_PER_DOOR = 80;
const MAX_STICKERS = 2000;
const MAX_POCKET = 40; // picked-up stickers one person can carry
const MAX_PNG = 60000; // characters of data URL; simple art is a few thousand
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const STICKER_ID = /^[a-z0-9]{10}$/;

const emptyStall = (): Stall => ({ bowl: emptyBowl(), marks: {}, pile: [] });
const num = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
const tenth = (n: number) => Math.round(n * 10) / 10;

export class Stalls {
  private stalls: Stall[];
  private outside: Outside[][];
  private stickers: Record<string, string> = {};
  private makers: Record<string, string> = {}; // sticker id → who made it
  private pockets: Record<string, Pocket> = {}; // person → what they've picked up
  private placeFile: string;
  private stickerFile: string;
  private saveTimer?: NodeJS.Timeout;
  private stickersDirty = false;

  constructor(count: number, dir: string) {
    this.placeFile = join(dir, "stalls.json");
    this.stickerFile = join(dir, "stickers.json");
    this.stalls = Array.from({ length: count }, emptyStall);
    this.outside = Array.from({ length: count }, () => []);
    try {
      if (existsSync(this.placeFile)) {
        const saved = JSON.parse(readFileSync(this.placeFile, "utf8")) as Saved | OldStall[];
        // an older file was just the list of stalls
        const stalls = (Array.isArray(saved) ? saved : saved.stalls) as (Stall & OldStall)[];
        stalls.slice(0, count).forEach((s, i) => {
          if (!s?.bowl) return;
          const marks: Record<string, Mark[]> = s.marks ?? {};
          // lines and stickers used to be kept apart, the stickers on top
          for (const [face, list] of Object.entries(s.strokes ?? {})) marks[face] = [...list];
          for (const [face, list] of Object.entries(s.placed ?? {})) (marks[face] ??= []).push(...list);
          this.stalls[i] = { bowl: s.bowl, marks, pile: s.pile ?? [] };
        });
        if (!Array.isArray(saved)) {
          saved.outside?.slice(0, count).forEach((d, i) => (this.outside[i] = d ?? []));
          this.makers = saved.makers ?? {};
          this.pockets = saved.pockets ?? {};
        }
      }
      if (existsSync(this.stickerFile)) this.stickers = JSON.parse(readFileSync(this.stickerFile, "utf8"));
    } catch (err) {
      console.error(`could not read what's in ${dir}; starting clean`, err);
    }
    mkdirSync(dir, { recursive: true });

    // the stickers that are always there, and a small pile of them wherever
    // the floor under the bowl is bare
    for (const [id, png] of Object.entries(DEFAULT_STICKERS)) {
      if (this.stickers[id] === png) continue;
      this.stickers[id] = png;
      this.stickersDirty = true;
    }
    this.stalls.forEach((stall, i) => {
      if (stall.pile.length === 0) stall.pile = starterPile(i);
    });
  }

  // --- what's in a stall -------------------------------------------------------

  bowl(i: number): Bowl {
    return this.stalls[i].bowl;
  }

  marks(i: number): Record<string, Mark[]> {
    return this.stalls[i].marks;
  }

  pile(i: number): Wad[] {
    return this.stalls[i].pile;
  }

  // every sticker you'd see in a stall: in the pile, or stuck up
  idsIn(i: number): string[] {
    const s = this.stalls[i];
    const stuck = Object.values(s.marks).flat().flatMap((m) => ("id" in m ? [m.id] : []));
    return [...new Set([...s.pile.map((w) => w.id), ...stuck])];
  }

  use(i: number, kind: BowlUse): void {
    useBowl(this.stalls[i].bowl, kind);
    this.touched();
  }

  // one more thing on a face; when there's too much, the oldest goes
  private put(i: number, face: string, mark: Mark): void {
    const stall = this.stalls[i];
    const list = (stall.marks[face] ??= []);
    list.push(mark);
    if (list.length > MAX_MARKS_PER_FACE) list.shift();
    let total = Object.values(stall.marks).reduce((n, l) => n + l.length, 0);
    while (total > MAX_MARKS_PER_STALL) {
      // the fullest face loses its oldest
      const fullest = Object.values(stall.marks).sort((a, b) => b.length - a.length)[0];
      fullest.shift();
      total--;
    }
    this.touched();
  }

  // checks a stroke someone sent, keeps it if it's sound, and hands back the
  // tidy copy to pass on; null means it was rubbish
  stroke(i: number, face: unknown, raw: unknown): Stroke | null {
    if (typeof face !== "string" || face.length > 40 || !FACE_NAME.test(face)) return null;
    const s = raw as Partial<Stroke> | null;
    if (!s || typeof s !== "object" || !KINDS.has(s.k as Kind) || !INKS.has(s.c as string)) return null;
    if (!NIBS[s.k as Kind].includes(s.w as number)) return null;
    const p = s.p;
    if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0 || p.length > MAX_POINTS) return null;
    if (!p.every((n) => num(n, -1, 400))) return null;

    const stroke: Stroke = { k: s.k as Kind, c: s.c as string, w: s.w as number, p: p.map(tenth) };
    this.put(i, face, stroke);
    return stroke;
  }

  // --- stickers ------------------------------------------------------------------

  // a new sticker: a small PNG with its shape in the alpha. Returns its id.
  make(png: unknown, maker: string): string | null {
    if (typeof png !== "string" || png.length > MAX_PNG || !PNG.test(png)) return null;
    // the bytes have to start the way a PNG does
    if (!Buffer.from(png.slice(22, 34), "base64").subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
    if (Object.keys(this.stickers).length >= MAX_STICKERS) return null;
    let id: string;
    do id = randomBytes(8).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10).padEnd(10, "0");
    while (this.stickers[id]);
    this.stickers[id] = png;
    this.makers[id] = maker;
    this.stickersDirty = true;
    this.touched();
    return id;
  }

  has(id: unknown): id is string {
    return typeof id === "string" && STICKER_ID.test(id) && id in this.stickers;
  }

  // the pictures for a list of ids, for anyone who hasn't seen them
  pngs(ids: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(ids)) for (const id of ids.slice(0, 200)) if (this.has(id)) out[id] = this.stickers[id];
    return out;
  }

  // what someone has picked up and not yet stuck anywhere
  pocket(who: string): Pocket {
    return this.pockets[who] ?? {};
  }

  // Can this person stick this sticker? Their own, always: they can make as
  // many as they like. Anyone else's, only a copy they picked up, which this
  // spends. A sticker from before makers were written down goes to whoever
  // first reaches for it.
  private spend(who: string, id: string): boolean {
    if (!(id in this.makers) && !(id in DEFAULT_STICKERS)) this.makers[id] = who;
    if (this.makers[id] === who) return true;
    const pocket = this.pockets[who];
    if (!pocket?.[id]) return false;
    if (--pocket[id] === 0) delete pocket[id];
    if (Object.keys(pocket).length === 0) delete this.pockets[who];
    return true;
  }

  // a wad of copies goes on top of the pile
  leave(i: number, id: unknown): boolean {
    if (!this.has(id)) return false;
    const pile = this.stalls[i].pile;
    pile.push({ id, left: WAD });
    if (pile.length > MAX_WADS) pile.shift(); // the bottom of the pile got swept
    this.touched();
    return true;
  }

  // one copy off the first wad that has any, into this person's pocket
  take(who: string, i: number, id: unknown): boolean {
    const pocket = this.pockets[who] ?? {};
    if (Object.values(pocket).reduce((a, b) => a + b, 0) >= MAX_POCKET) return false;
    const pile = this.stalls[i].pile;
    const at = pile.findIndex((w) => w.id === id && w.left > 0);
    if (at === -1) return false;
    if (--pile[at].left === 0) pile.splice(at, 1);
    pocket[id as string] = (pocket[id as string] ?? 0) + 1;
    this.pockets[who] = pocket;
    this.touched();
    return true;
  }

  // a sticker stuck on a face inside, over whatever's already there
  stick(who: string, i: number, face: unknown, raw: unknown): Stuck | null {
    if (typeof face !== "string" || face.length > 40 || !FACE_NAME.test(face)) return null;
    const s = raw as Partial<Stuck> | null;
    if (!s || typeof s !== "object" || !this.has(s.id) || !num(s.u, -1, 400) || !num(s.v, -1, 400) || !num(s.r, -180, 180)) return null;
    if (!this.spend(who, s.id)) return null;
    const stuck: Stuck = { id: s.id, u: tenth(s.u), v: tenth(s.v), r: Math.round(s.r), s: STICKER_CM };
    this.put(i, face, stuck);
    return stuck;
  }

  // a sticker stuck on the outside of a door
  stickOutside(who: string, door: number, raw: unknown): Outside | null {
    const s = raw as Partial<Outside> | null;
    if (!s || typeof s !== "object" || !this.has(s.id) || !num(s.u, 0, 1) || !num(s.v, 0, 1) || !num(s.r, -180, 180)) return null;
    if (!this.spend(who, s.id)) return null;
    const out: Outside = { id: s.id, u: Math.round(s.u * 1000) / 1000, v: Math.round(s.v * 1000) / 1000, r: Math.round(s.r) };
    const list = this.outside[door];
    list.push(out);
    if (list.length > MAX_OUTSIDE_PER_DOOR) list.shift();
    this.touched();
    return out;
  }

  outsideAll(): Outside[][] {
    return this.outside;
  }

  // --- keeping it ----------------------------------------------------------------

  private touched(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 1000);
  }

  save(): void {
    clearTimeout(this.saveTimer);
    try {
      const saved: Saved = { stalls: this.stalls, outside: this.outside, makers: this.makers, pockets: this.pockets };
      writeFileSync(this.placeFile, JSON.stringify(saved));
      if (this.stickersDirty) {
        writeFileSync(this.stickerFile, JSON.stringify(this.stickers));
        this.stickersDirty = false;
      }
    } catch (err) {
      console.error(`could not write to ${this.placeFile}`, err);
    }
  }
}
