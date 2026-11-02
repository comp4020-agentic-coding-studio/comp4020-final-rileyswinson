# Process overview

Stalls started as a coarse idea that I wrote out as one long plain-text description, and the work since has been refining that description a piece at a time. The motivation was the graffiti in the bathrooms of the places I'm a regular at: I've watched those walls change over time, and I wanted that online.

Of course, I first needed to create design ideas to encourage interactivity. I decided I wanted somewaht small cubicles. I wanted it to be 3d rendered models with some relativley harsh light (though this was hard to achieve in browser rendering) ([`b8582d3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/b8582d3)). I wanted every selectable face to be drawable, which took quite some effort to get working ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)).

I created it through many rounds of discussion, across mupltiple conversations (partly to reset context, but also beacuse when given context, AI models get stuck in the same ways of thinking).

Each round of conversation was based on completing a narrow and well-defined task. It typically took multiple rounds of re-creating the entire task to figure out how to describe what I wanted in natural language for Claude to return something I was happy with. For example, one of the most difficult visual components was getting the hallway with the 4 doors to look how I wanted ([`07974cd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/07974cd)). I knew it was going to be 3d with a light above and dooors that open as you hover -- but AI is terrible at making artistic decisions from sparse descriptions, so I had to imagine, draw sketches of, and describe with words how I wanted each part to look. Getting the texture on the doors to look in a way I was happy with took over an hour, beacuse creating different-looking wood-based doors with interactive vacant/occupancy sliders with a hover animation that feels coherent and good to use requires a lot of specificity.

After the outside, I made the inside of the stalls ([`b8582d3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/b8582d3)). It required similar amounts of iteration, but I was very impressed with how well Claude could create the low-poly 3d models. I will spare the details here.

Claude also managed to implement drawing very successfully early on ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)). It look a deal of effort to get the views to look in the direction I wanted to, and to get the character height and movement animations to feel smooth -- but the act of clicking on a face and painting worked well after only a few iteartions.

I created each feature using a similar iterative conversational approach, with intermitent testing with myself, and the occasional user test by giving it to friends or in crits ([crit 10 reflection](reflections/crit-10.md)).

I first only had a drawing tool, but this felt very restrictive. It was one
size, and quite slow. I added sizes to the pen, and then added a transparency
option in the form of a paint pen (opaque) and a market (transparent). This
allowed more variety. I added a spray paint tool to provide an alterative more
impactful and textureful drawing medium ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)).

After some testing, it was clear some kind of interactivity was missing. While
seeing the artwork other's made was cool, there was nothing more to
*discover*. There was also nothing to do when outside of the stalls.

So, I added smaller things:

- Going to the toilet with the "piss" and "shit" options. People from other
  stalls can hear these sounds effects, and if you do not flush the toilet, it
  stays there for the next person ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)).
- Players can "knock" on occupied stalls, which makes the screen of the person
  inside shake ([`4a045b5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/4a045b5)).
- A 5-minute timer kicks people out the stalls so abandoned tabs get removed ([`07974cd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/07974cd)).
- Random light flickering events ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)).
- Other small interactions

The largest thing I added were stickers. They are made with the "sticker
station" button at the bottom of the screen when not inside any stalls. They
can be placed anywhere -- including on the doors in the hallway -- and can be
left underneath the toilet in a pile for other people to take and use ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db), [`e334270`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/e334270)).

I generated noise using prior experience with AI. First, I looked for public domain materials for the more complicated noises, like the toilet ones ([`4a045b5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/4a045b5)). 
Second, I know that simply asking AI to generate sounds goes very poorly. However, providing it with a limited toolbox of possible foundational waves and to construct basic sounds from worked well ([`b8582d3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/b8582d3), [`4a045b5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/4a045b5)). I decided to use one sound for most UI interactions, and generate a few other sounds for things like kocking on doors, and the lights flickering. While the sound is not the greatest ever, it does add to the experience, especially when there are multiple people.

I tested interactive elements by using a window and an incognito window.

But, overall, the AI was very competent at creating the general infrastructure needed to support my ideas. But anything that required an understanding of what might be appealing to a human - 
So, I added smaller things:

- Going to the toilet with the "piss" and "shit" options. People from other stalls can hear these sounds effects, and if you do not flush the toilet, it stays there for the next person.
- Players can "knock" on occupied stalls, which makes the screen of the person inside shake.
- A 5-minute timer kicks people out the stalls so abandoned tabs get removed. 
- Random light flickering event.
- Other small interactionss

The largest thing I added were stickers. They are made with the "sticker station" button at the bottom of the screen when not inside any stalls. They can be placed anywhere -- including on the doors in the hallway -- and can be left underneath the toilet in a pile for other people to take and use.
UI/UX, sound design, any movement -- the AI did terribly at, and I had to describe in great detail what I wanted, which of course required a clear vision for the work.

The stack is deliberately small: one Node server with two dependencies, `ws` for WebSockets and `marked` to render the README, and plain JavaScript in the browser with no build step ([`07974cd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/07974cd)). WebSockets suit the app because the server alone decides who gets a stall, and knocks and noises need to reach everyone immediately. The 3D is CSS transforms with a 2D canvas on each wall rather than WebGL, so every wall can be directly hovered, clicked and drawn on. The cost is the harsh lighting I wanted ([`b8582d3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/b8582d3), [`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)).

For storage, I skipped a database. Everything is held in memory and written to two JSON files on the Fly volume, one for the stalls and one for the stickers, about a second after the last change and again at shutdown ([`de705db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-rileyswinson/commit/de705db)). With one machine, four stalls and capped data, a database would mostly add moving parts. SQLite would have fit on the same volume, and it would be safer: a crash can lose the last second of work, and every save rewrites the whole file. I accepted that for a small app among friends, but it could never grow past one machine.

I end on a very intentional decision: very limited use of Claude.md. As I previoulsy discussed, I frequenlty create new AI chats when creating. Because this project is a creative one, there are not super strict rules on what must or must not change. I find that adding additional context to the AI results in a decrease in the variety of outputs, and therefore result in a higher likelyhood of getting "stuck" trying to create a featue and the AI repetedly making the same mistakes. Consequently, given the low importance of consistency in implementation and between iteartions, I decided to use natural language restrictions as they were relevant to the task -- beacuse Claude is quite good at only touching parts which directly relate to the written request, and in an app this small, it is quite easy to just describe the 2-3 related features to not change when starting a new conversation.

The "failures" weren't worth documenting in "the harness" beacuse the failures were very visual, intuitive problems -- and describing a human problem in a flawed text format results in the kind-of narrowing of the results from the AI in a way that does not actually prevent or fix the problem.

Instead, the only things I have in the claude.md aarebasic rules around what the app itself should or should not do. that is, basic high-level philosophies, such as the fact the game is anonymous, that prevent allways-wrong decisions from happening in the first place.
