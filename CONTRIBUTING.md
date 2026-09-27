# Contributing to floo

floo is MIT licensed, and contributions are welcome — bug reports, new shapes,
themes, providers, or whatever else you find useful. If you only want to report
something broken, the [bug section](#reporting-bugs) is all you need.

## Running floo locally

floo is a small monorepo with three workspaces: `frontend` (the canvas),
`backend` (the API and its LLM calls) and `shared` (types and validation that
both use). CI runs on Node 26, so use that.

```bash
npm ci
cp backend/.env.example backend/.env
```

Then fill in at least one API key in `backend/.env` — generation fails with a
config error if none are set. That file is gitignored so your keys stay local;
just never commit one, and keep the template itself key-free.

```bash
npm run dev
```

That starts both halves together: the API on port 3001, the canvas on 5173.
Vite forwards `/api` and `/health` to the backend, so open the canvas and
everything resolves. `npm run dev:backend` and `npm run dev:frontend` run one
side on its own if that's easier.

## Before you open a pull request

CI runs exactly four commands, and all four have to pass:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Worth running them yourself before pushing — it saves a round trip. Tests run
under Vitest in all three workspaces, so put them in the same commit as the
change they cover.

## Style

Prettier formats, ESLint lints. The settings you can see in diffs: no
semicolons, single quotes, 100 column width, trailing commas.

```bash
npm run format
npm run lint:fix
```

One thing to be careful about: try to match the file you're in. If a file
hasn't been formatted yet, don't reformat it as part of your PR — it just
makes your change harder to read.

## Adding a new shape

Shapes are the flowchart notation — Start, Decision, Database, and so on. Text
and Media are the exception: they have no ports, and they live in the dock
rather than the Shapes menu.

The nice thing is that there's one list to change. `shared/src/flowchart.ts`
defines `NodeKind` along with a `NODE_KINDS` array, and everything else reads
from it — the canvas builds its React Flow node types from that array, and
`ShapesMenu.tsx` builds the menu from it too. So to add one:

- add the kind to `NodeKind` and `NODE_KINDS` in `shared/src/flowchart.ts`
- if it has no ports, add it to `isFreeFloating()` — that same check is what
  keeps free-floating kinds out of the Shapes menu
- give it a default name in `defaultLabel()` in `frontend/src/lib/ids.ts`
- draw it in `frontend/src/nodes/FlooNode.tsx`, where the branches for text,
  media and decision live, and style it in `FlowEditor.css` under a
  `.floo-node--<kind>` class the way the others are
- if the AI should be able to generate it, mention it in
  `backend/src/llm/prompts.ts`

You don't need to touch either menu. And `adapters.test.ts` already round-trips
every kind, so import and export are covered without you having to write a
test for them.

## Themes

All the colours come from custom properties in `frontend/src/index.css` —
`:root` for light, `[data-theme='dark']` for dark. If you add a token, add it
to **both** blocks. A token that only exists in one of them falls back to
whatever the browser decides, and that is nearly always the reason something
looks broken in dark mode only.

The theme itself is a two-value union in `frontend/src/lib/theme.ts`, applied
as `data-theme` on the `<html>` element. Adding a third theme means adding it
there, writing a `[data-theme='...']` block, and branching in the toggle.

Two things to be aware of. A fair amount of `FlowEditor.css` still hard-codes
colours — node fills and caption text, mostly — so converting those into tokens
is a genuinely useful PR on its own, and necessary before a third theme. And
exported PNGs take their background from `EXPORT_BACKGROUND` in
`FlowEditor.tsx`, which is per theme, so a new theme needs an entry there too.

Any UI change is worth checking in both themes, and worth exporting once to see
what the user actually gets.

## Adding an LLM provider

Providers implement the `FlowchartProvider` interface in
`backend/src/llm/adapter.ts`. Copy `gemini.ts` or `groq.ts` — both come with
tests worth copying too.

Then register it in `createBackend` in `backend/src/backend.ts` (keys and
default model), and decide where it belongs in `fallback.ts`. Order is the
strategy there: a provider is only tried once the ones before it have failed.

If it's rate-limited, give it its own RPM knob in `rateLimit.ts` rather than
borrowing another provider's. Finally, add the keys to
`backend/.env.example` with empty values and list the provider under "Currently
Supported Providers" in the README.

## Keybinds

They all live in the `keydown` listeners in `frontend/src/components/FlowEditor.tsx`.
If you add one, make sure it ignores itself when focus is in a text field or
someone is editing a label inline, or you'll break typing. Add the row to the
Keybinds table in the README in the same PR.

## Pull requests

Branch from `main`. Commit subjects in lowercase and imperative — `add edge
label editing`, not `Added edge label editing` — and keep them short.

One change per PR where you can. Reformatting, renames and dependency bumps all
make a review harder, and they're easy to split into their own.

It helps to say what changed, why, and anything you weren't able to verify.

## Reporting bugs

An issue with what you did, what you expected, what actually happened, and your
browser and Node versions is enough to get started. For canvas bugs, a
screenshot or short screen recording saves a round trip.

## House notes

- `MILESTONE.md` keeps track of design decisions and what's shipped — worth
  reading before a large UI change.
- Prefer theme tokens over literal colours, so light and dark keep working.
- The build prints chunk-size warnings. They're expected; don't bump
  dependencies to silence them.
