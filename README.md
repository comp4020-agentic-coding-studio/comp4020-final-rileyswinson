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

Inside, you'll be able to draw on the walls and leave stickers. For now the
room is a placeholder with a timer and a way out.

## Running it

```sh
pnpm install
pnpm start          # http://localhost:8080
pnpm check          # against the running app
```
