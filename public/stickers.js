// Stickers, on this side: the pictures themselves (small PNGs, by id), the
// ones this browser made, and the ones you've picked up from piles. The ones
// you made are kept in localStorage; what you've picked up is the server's
// to say. Sticking one is always two steps: choose which, from the chooser,
// then click where it goes.

const pngs = new Map();
const images = new Map(); // id → an Image, for drawing onto a canvas
const waiting = new Map(); // id → <img>s made before their picture arrived
const listeners = new Set();

const chooser = document.getElementById("chooser");
const ghost = document.getElementById("ghost");

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem("stall-stickers")) ?? [];
    return saved.filter((s) => s && typeof s.id === "string" && typeof s.png === "string");
  } catch {
    return [];
  }
}

function write(mine) {
  try {
    localStorage.setItem("stall-stickers", JSON.stringify(mine));
  } catch {
    // a full or blocked store only costs the list; the server still has them
  }
}

function known(id, png) {
  pngs.set(id, png);
  if (images.has(id)) images.get(id).src = png;
  for (const img of waiting.get(id) ?? []) img.src = png;
  waiting.delete(id);
}

function changed() {
  for (const fn of listeners) fn();
}

export const stickers = {
  mine: read(), // [{ id, png }], oldest first: yours, to use as often as you like
  pocket: {}, // { id: copies } picked up from piles
  placing: null, // the sticker chosen and waiting for somewhere to go

  // pictures from the server, as { id: png }
  learn(record) {
    if (record) for (const [id, png] of Object.entries(record)) known(id, png);
  },

  // an <img> of a sticker, which fills in when its picture turns up
  img(id, cls) {
    const img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.draggable = false;
    if (pngs.has(id)) img.src = pngs.get(id);
    else waiting.set(id, [...(waiting.get(id) ?? []), img]);
    return img;
  },

  // the same picture as something a canvas can draw; `then` runs once it can
  image(id, then) {
    let image = images.get(id);
    if (!image) {
      image = new Image();
      images.set(id, image);
      if (pngs.has(id)) image.src = pngs.get(id);
    }
    const ready = image.complete && image.naturalWidth > 0;
    if (!ready && then) image.addEventListener("load", then, { once: true });
    return ready ? image : null;
  },

  addMine(id, png) {
    known(id, png);
    this.mine.push({ id, png });
    write(this.mine);
    changed();
  },

  // The server's list of which of yours it still has. One it has lost (its
  // data was cleared) can't be left or stuck any more, so it's forgotten
  // here too. It answers for 200 at a time; any past that are left alone.
  keepMine(known) {
    const kept = this.mine.filter((m, i) => i >= 200 || known.includes(m.id));
    if (kept.length === this.mine.length) return;
    this.mine = kept;
    write(kept);
    changed();
  },

  setPocket(pocket) {
    this.pocket = pocket ?? {};
    changed();
  },

  on(fn) {
    listeners.add(fn);
  },

  // Opens the chooser: yours, and what you've picked up. Resolves with the
  // one chosen, or null if it's closed without choosing.
  choose() {
    return new Promise((resolve) => {
      const close = (id) => {
        chooser.hidden = true;
        chooser.removeEventListener("click", outside);
        removeEventListener("keydown", escape, true);
        resolve(id);
      };
      const outside = (e) => {
        if (e.target === chooser || e.target.closest(".chooser-close")) close(null);
      };
      const escape = (e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // this Escape closes the chooser and nothing behind it
        close(null);
      };
      const tile = (id, label) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tile";
        const tag = document.createElement("span");
        tag.textContent = label;
        b.append(this.img(id, "tile-art"), tag);
        b.addEventListener("click", () => close(id));
        return b;
      };
      const carried = Object.entries(this.pocket);
      chooser.querySelector(".chooser-mine").replaceChildren(...this.mine.map(({ id }) => tile(id, "yours")));
      chooser.querySelector(".chooser-mine-note").textContent = this.mine.length
        ? ""
        : "None yet. Make some at the sticker station, out in the corridor.";
      chooser.querySelector(".chooser-pocket").replaceChildren(...carried.map(([id]) => tile(id, "picked up")));
      chooser.querySelector(".chooser-pocket-note").textContent = carried.length
        ? ""
        : "None yet. There's a pile under every toilet.";
      chooser.hidden = false;
      chooser.addEventListener("click", outside);
      addEventListener("keydown", escape, true);
    });
  },

  // the chosen sticker follows the pointer until it's put somewhere
  place(id) {
    this.placing = id;
    document.body.classList.toggle("sticking", !!id);
    ghost.hidden = !id;
    if (id) ghost.src = pngs.get(id) ?? "";
    changed();
  },
};

for (const { id, png } of stickers.mine) pngs.set(id, png);

addEventListener("pointermove", (e) => {
  if (!ghost.hidden) ghost.style.translate = `${e.clientX}px ${e.clientY}px`;
});

addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !stickers.placing) return;
  e.stopImmediatePropagation(); // this Escape puts the sticker away, and that's all it does
  stickers.place(null);
});
