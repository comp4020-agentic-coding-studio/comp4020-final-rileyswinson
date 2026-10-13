# Process overview

Stalls started as a coarse idea that I wrote out as one long plain-text
description, and the work since has been refining that description a piece at
a time. The motivation was the graffiti in the bathrooms of the places I'm a
regular at: I've watched those walls change over time, and I wanted that
online. The movement and the mood came from Inscryption. You don't walk
around; you turn between a few fixed views of a small dark room.

Each round took one part of the description and made it real. Then I looked at
what came back and described what was wrong with it. The corridor and its live
doors came first
([`07974cd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/07974cd)).
Next was the inside of a stall with nothing to do in it, only the fixed views
to turn between
([`b8582d3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/b8582d3)).
Drawing and stickers followed
([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)),
and then a pass on the sticker pile alone, which had come out as a stack of
slabs and needed to be a loose heap
([`e334270`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/e334270)).

Getting the AI to do the 3D was easier than I expected. I'd assumed a room you
can look around would be the hard part, and it wasn't. The cost showed up in
the interface instead. The 3D work messed up the UI a lot: by
[`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)
the corridor doors had stopped swinging open on hover, and walls that ran past
the viewer couldn't be hovered at all. Fixing the UI took a lot of
hand-holding, describing step by step what should be on screen, where it
should sit and what it should do.

That set how I work with it now. I hand over a rough idea for the structurally
ambitious parts and expect something close to come back. The interface details
only come out right when I describe them precisely, so that is where my
attention goes.
