# Stalls

Bathroom-wall graffiti, online. There are four stalls, and at most four people
can be inside at once. Each one gets a timed visit, like a public toilet whose
door unlocks itself after a while. There are no accounts.

## The hallway

A black corridor holds four outlined doors. Each door has an occupied/vacant
slider: red and pushed left when someone is inside, green and pushed right
when it's free. Hovering over a vacant door creaks it open, and white light
spills out across the floor. Clicking an open door takes you inside. A door's
state reaches everyone else in the hallway as it changes, with no reload.

## Inside

The stall is a small box you look around from fixed spots, the way a
point-and-click works: chevrons at the screen's edges (or the arrow keys) turn
you to the left partition, the right one, or the back of the door, and facing
the toilet you can look straight ahead, down at it, up at the light, or crouch
to see under the bowl. Looking straight or down, you can still turn. One coloured lamp lights the lot, a different colour in each stall, and the dark at the edges
of your view closes in as your time runs out.

Anything you can see, you can draw on, except the floor. Hover it and the word
*draw* appears; click and you're taken right up to that spot. There are three
things to draw with, in ten colours: a paint pen, bright and solid; a
permanent marker, duller and see-through; and a mini spray can, very wide and
made of specks. Up close you can also *add a sticker*: choose one, then click
where it goes. Lines and stickers go on in the order you put them, each over
whatever was there, so you can draw across a sticker or stick one over
another. It all stays: on that wall, in that stall, for whoever comes in
next, and it survives the server restarting.

You can sit down, and what you do there is heard, muffled, by everyone in the
corridor. The flush plate has a half and a full. What goes in the bowl stays
in it, for the next person too, until a flush takes it. Sliding the latch on
the back of the door lets you out. The door lets itself open after five
minutes.

## Sound

There are only a few sounds, on purpose. A door creaks when you hover it.
Knocking on an occupied door is heard by everyone, and jolts the view of
whoever's inside it a moment later. Every button and choice makes the same
small click. The pen, the marker and the spray can each sound while a line is
being drawn, and a sticker going on peels faintly. A clock ticks when you have
thirty seconds left, and again through the last five.

Those are all made in the browser from noise and a few oscillators. Pissing,
shitting and flushing are recordings, all public domain; `public/audio/CREDITS.md`
says where each came from. Everything goes through one bus that squashes it
hard and narrows it to the middle of the band, like a cheap speaker in a tiled
room. Browsers keep a page silent until you first click or press a key.

## Stickers

Stickers are made at the sticker station, which is out in the corridor and
nowhere else. You draw an outline, in as many goes as you like, until its two
ends meet; pick the colour of its edge and of its inside; draw on it; and
finish. The ones you make are yours to stick as often as you like, and your
browser remembers them. The server keeps every one.

To pass them on, crouch under a toilet. There's a spot on the floor there
where you can leave ten copies of one of yours. They land loose, on the floor
and on each other, so the heap is as big as what's been left. A pile holds ten of any one sticker
at most, so leaving more only tops it back up. Anyone in that stall can take
from the pile, one copy of each sticker at a time, and carry them: to stick
up in that stall, in another, or on the outside of any door in the corridor,
where everyone sees it. Sticking someone else's sticker uses up the copy, and
then you can take another. Every stall keeps three that were already there (a
name tag, a fruit sticker and a price), and whenever someone comes in there
are ten of each.

## Running it

```sh
pnpm install
pnpm start          # http://localhost:8080
pnpm check          # against the running app (it draws on its walls)
pnpm check:fresh    # the same spec, against a throwaway copy with its own data
```
