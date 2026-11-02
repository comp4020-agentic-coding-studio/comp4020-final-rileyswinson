# Stalls: the rules

Bathroom graffiti, online, for my friends and the people in this course. These
are limits on what the app may become, and they apply to every conversation.
How anything looks, sounds or is built is left out on purpose: extra context
narrows what comes back, so that detail goes in the request. If a request
conflicts with a rule here, say so before building it.

Rules marked *(tested)* are enforced by `spec/`. The rest are judged.

## What the app must never do

- **Never identify anyone.** No accounts, names, profiles or cookies. A person
  is a random id in `localStorage`, and nobody else is ever sent it. *(tested)*
- **Never show who someone is or what they're doing.** A door shows only whether
  it's taken and when it opens. Arriving, standing in the corridor and leaving
  aren't announced. Nothing says who made what. *(tested)*
- **Never censor.** No filters, reporting, moderation or admin tools, and no
  cleaning up the crude parts. They are part of the experience.
- **Never turn it into a platform.** No scores, likes, feeds, leaderboards or
  rooms. It's for a few people, not for growth.

## What must stay true

- **Four stalls, one person in each.** No extra stalls, queues or copies of the
  building. Sharing them is what makes "go see what I did!" work. *(tested: one
  person per stall, one stall per person)*
- **A visit ends by itself.** The door opens after five minutes, so abandoned
  tabs don't hold a stall.
- **What people leave stays.** Marks, stickers and an unflushed bowl are there
  for whoever comes next, across restarts and redeploys, so all of it lives under
  `DATA_DIR`. Add no eraser, undo or expiry. The only things that remove anything
  are a flush, taking a sticker from a pile, and the storage caps in
  `server/stalls.ts`, which keep the app inside its memory and volume. *(tested:
  bowls, marks and stickers reach the next person)*
- **Other people are felt, live.** Whatever another open window can see reaches
  it within a second, with no reload. Noises and knocks reach everyone; drawing,
  sticking and picking up stickers make no sound for anyone else. *(tested)*
- **No tutorial.** "It's bathroom vandalism and you can draw anywhere in the
  stall!" has to be enough to work out the controls within a few minutes. No
  onboarding, tooltips tour or instructions screen.
- **Works in Chrome on phones and laptops.** Every control has to work by touch.
  Check a phone-sized and a laptop-sized window.
- **You turn; you don't walk.** Fixed views and the arrows at the screen's edges,
  so the same controls work on both.
- **Limited colours.** The fixed set of inks stays, with no free colour picker,
  so the mess stays vibrant.

## What a change must not break

- **Touch only what the request is about.** 3D work has broken the interface
  before ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)):
  after changing the scene, check that the corridor doors still swing open on
  hover and that every wall can still be hovered and drawn on.
- **Try anything multi-person in two sessions:** one normal window and one
  incognito window, side by side.
- **Run `pnpm check` against the running app before calling something done.**
  Never delete or loosen a test to get it passing. If a rule above changes, I
  change it first, then the test.
- **When a mistake could happen again, propose a rule or a check for it.** Don't
  just retry until it passes.

## What stays as it is

- `fly.toml`, the one machine and the one volume, and `spec/invariants.test.ts`.
- `/readme/` publishes `README.md` in full.
- Plain JavaScript in `public/` and Node with `ws` in `server/`: no framework, no
  build step and no new dependency unless I ask.
- `README.md`, `PROCESS.md`, `reflections/` and `research-note.md`, if there is
  one, are my writing. Don't draft or rewrite them unless I ask.
