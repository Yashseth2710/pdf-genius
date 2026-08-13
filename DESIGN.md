# PDF Genius — design system

The authority for type, colour, shape and spacing in this app. A font, colour,
radius or size that is not in here is drift: either use what is documented, or
change this file on purpose.

---

## What the product is

A utility. Someone arrives with a file and a problem — too big to email, pages in
the wrong order, five separate scans that should be one document — and leaves
with it solved. The interface is furniture around that, and it succeeds by being
easy to read and hard to misunderstand, not by being memorable.

Two modes, and they want different things:

- **The landing page persuades.** It is allowed larger type, more air, and a
  point of view.
- **Everything behind sign-in helps someone work.** Dense, quiet, legible.
  Nothing on those screens exists to look good.

## The voice

Plain British English. Say what the thing does, in the words a person would use
saying it out loud.

- No `streamline`, `empower`, `supercharge`, `seamless`, `powerful`,
  `world-class`, `unlock`, `elevate`.
- Report what happened, not what was requested. "75% smaller (3.8 MB → 977 KB)",
  measured after the run. When a file could not be shrunk, say
  "already as small as it goes" rather than reporting a 0% success.
- At most one em-dash in any block of prose, and prefer a full stop. A page of
  em-dash-joined clauses has a recognisable cadence and it is not a human one.
- Buttons name what happens: "Sign up", "Create account", "Download all 3".
  Never "Get started", "Learn more", "Continue".
- Destructive-sounding actions say what survives. The delete button in the
  history reads "Removes the entry. Your files are kept."

---

## Type

Three families, each with a job. Set as CSS variables in `app/globals.css` and
loaded through `next/font` in `app/layout.tsx`.

| Token           | Family         | Used for                                       |
| --------------- | -------------- | ---------------------------------------------- |
| `--font-sans`   | Public Sans    | The interface. Body copy, labels, buttons.     |
| `--font-heading`| Source Serif 4 | `h1`–`h4`, the wordmark, result figures.       |
| `--font-mono`   | IBM Plex Mono  | Step numbers, byte counts, before/after sizes. |

**Why these.** Public Sans was drawn for the US design system, which means it
was drawn for forms and long official documents, which is nearly what this app
is. Source Serif is the obvious face for a product about documents and does the
work a second family is for: you can tell a heading from body text without
either changing size. Neither is Inter, Geist, Space Grotesk or Instrument
Serif, which are now on enough sites to have stopped meaning anything.

Headings are **always roman, never italic**. An oversized italic serif headline
reads as taste for about a week and as a template after that.

### The scale

Steps are at least 1.25 apart. Sizes between them are drift.

| Role                | Class       | Size |
| ------------------- | ----------- | ---- |
| Landing headline    | `text-5xl`  | 48px |
| Page title (`h1`)   | `text-3xl`  | 30px |
| Section (`h2`)      | `text-xl`   | 20px |
| Sub-section (`h3`)  | `text-lg`   | 18px |
| Body                | default     | 16px |
| Secondary, controls | `text-sm`   | 14px |
| Meta                | `text-xs`   | 12px |

Nothing functional goes below 12px, and 12px is only for metadata that repeats a
fact already on screen. Body leading is 1.6; headings tighten to 1.25 via
`leading-tight` in the base layer.

**No negative letter-spacing.** No `tracking-tight` anywhere. A text serif is
drawn with the spacing it wants, and crushing it to look designed costs
legibility and gains nothing.

Numbers that sit in a column (file sizes down a list, page counts, percentages)
take the `.tabular` utility so the digits line up.

**Mono is for code, data and measurement**, never as a costume for "technical".
In practice that means the byte counts in a compression result and nothing else.
A single digit set in mono to look engineered is the costume.

Headings take `text-balance` so their lines even out. Body copy takes
`text-pretty`, which only guards the last line. They are not interchangeable.

In dark mode body text gets `0.006em` of extra tracking. Light type on a dark
ground optically blooms, so identical spacing reads tighter than it measures.
Headings are large enough not to need it and look loose if they get it.

---

## Colour

Ink on paper, and one red.

Every neutral carries a little chroma on a warm hue (60–80°) and stays under
`0.006`. Pure `oklch(x 0 0)` greys are what a screen looks like when nobody
chose, and the warmth is invisible as colour but visible as intent. It stays low
deliberately: past about `0.02` this becomes a cream page, which is its own
reflex.

### The tokens

| Token                | Job                                                             |
| -------------------- | --------------------------------------------------------------- |
| `--background`       | The page.                                                       |
| `--foreground`       | Body ink.                                                       |
| `--muted-foreground` | Secondary text. Meets 4.5:1 on `--background`.                   |
| `--border`           | Hairlines, which do most of the structural work in this app.     |
| `--primary`          | Ink. Default buttons. **Not** a hue.                             |
| `--brand`            | The one red, from the fold in the logo.                          |
| `--brand-muted`      | The wash behind a chosen thing.                                  |
| `--destructive`      | Delete, and errors.                                              |
| `--success`          | The tick that says an operation finished. Nowhere else.          |

**The red means "this one".** It marks the selected file, the chosen compression
level, the row being dragged, the focus ring, and the logo. It is not used for
emphasis, decoration, or to make a section look important. If red appears twice
on a screen meaning two different things, one of them is wrong.

**Buttons stay ink.** A red primary button would argue with the red on the
delete actions, and destructive should never have to shout over the furniture.

Raw Tailwind palette colours (`green-700`, `blue-500`) are not allowed in
components. If a colour is needed, it goes in the token list above first.

Dark mode is the same ink and paper with the lights off: warm-neutral surfaces,
no coloured glow behind anything, and the red lifts to `0.62` lightness because
at `0.53` on a near-black ground it fails contrast and reads brown.

---

## Shape and depth

`--radius: 0.5rem`. Cards land at 10–11px, controls at 8px. Nothing in the app
goes past 16px except pills and avatars, which are fully round on purpose.

**Depth is used once or not at all.** A hairline border *and* a soft drop shadow
on the same element is a recognisable generated-UI signature — pick the edge or
pick the elevation. Shadows here are reserved for things that are genuinely
lifted: an element mid-drag, and a dialog. Not cards, not panels, not on hover.

**No glassmorphism.** The header is opaque. Blur behind a bar solves a real
problem when content scrolls under a translucent surface; this bar has a solid
background and a rule beneath it, so a blur would only be for the look of it.

**No decorative gradients, halos, spotlights or grid backgrounds.** There are
none in the app and there is no reason to add one.

---

## Layout

Content is capped at `max-w-5xl` (1024px) with `px-6 sm:px-8`. Prose is capped
much shorter — around 65–75 characters — using `max-w-xl` or `max-w-lg`.

**Ranged left.** Headline, paragraph and buttons all centred is the shape every
generated landing page arrives in, and it reads worse besides: the eye has to
hunt for the start of each line. Centring is for a single short line, or nothing.

**Lists are ruled, not boxed.** Documents, history, tool results and the tool
index are rows separated by hairlines. A border around every row of a list is
depth that says nothing — the rows are siblings, and a rule says so more quietly.
A box is earned when a row is *selectable* and needs to show a chosen state, or
when a group of controls needs holding together.

**No cards inside cards.** If something needs separating inside a panel, use
spacing, a rule, or type weight.

**No icon tiles.** A small rounded square, tinted with the accent, holding a
16px glyph, sitting above a heading, is the single most recognisable piece of
generated-UI furniture. Icons in this app sit inline, at `size-4`, in
`--muted-foreground`, in the line of the thing they label — where they help you
find a row rather than decorating one.

**Spacing has rhythm.** Related things sit at `space-y-1` / `gap-2`, groups at
`space-y-4`, sections at `space-y-10`. The same value everywhere is not a
system, it is the absence of one. A heading always has more space above it than
below it, so it belongs to what follows.

---

## Motion

- Transitions are `transition-colors` on hover and focus. Ease-out, fast.
- Animate `transform` and `opacity` only. Never width, height, padding or
  margin.
- **Spinners are for things that are actually running.** No pulsing status dots,
  no fake terminal cursors, no marquees, no bounce or elastic easing, no scaling
  images on hover.
- Skeletons match the shape of the content that replaces them, so nothing jumps.

---

## Accessibility, as design constraints

These are not a separate checklist; a design that fails them is not finished.

- Body text meets 4.5:1, large text 3:1, in both themes.
- Heading levels never skip.
- Anything that navigates is an `<a>`. Anything that acts is a `<button>`.
  A `Button` rendered "as" a link announces itself as `role="button"`, which is
  a lie about what will happen.
- Decorative icons are `aria-hidden`. Icon-only controls carry an `aria-label`
  **and** a tooltip: the label is for a screen reader, the tooltip is for a
  sighted person who does not recognise the glyph.
- Focus is always visible, and it is the brand red.
- Every state is designed, not just the happy one: loading, empty, error, and
  the difference between "you have never done this" and "your filter matched
  nothing".

---

## Checks before shipping a screen

1. Is any font, colour, radius or size on it absent from this file?
2. Could the copy have been written by a person who uses the product?
3. Is there a box, tile, tint, gradient or shadow that could be a rule, a
   weight change, or nothing at all?
4. Does the one red mean exactly one thing on this screen?
5. Do the empty, loading and error states exist, and does the empty state know
   which kind of empty it is?
6. Read the longest line. Is it under about 75 characters?
