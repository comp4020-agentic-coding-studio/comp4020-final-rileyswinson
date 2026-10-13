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
the toilet you can look up at the light or crouch to see under the bowl. You
can sit down, and what you do there is heard, muffled, by everyone in the
corridor. The latch on the back of the door lets you out.

The walls are bare for now. Drawing on them is next.

## Running it

```sh
pnpm install
pnpm start          # http://localhost:8080
pnpm check          # against the running app
```
