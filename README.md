<div align="center">
  <img src="assets/floo-banner.png" alt="Floo" width="600" />

  <h1>floo</h1>

  <p>An AI-first flowchart editor. Describe a process in plain language and Floo turns it into an editable flowchart — or tell it what to change and it edits the diagram you already have.</p>
</div>

---

Built as a TypeScript monorepo with three workspaces:

- **[frontend](./frontend)** — React + [React Flow](https://reactflow.dev/), Vite dev server, [elkjs](https://raw.githubusercontent.com/OpenKieler/elkjs/master/doc/elkgraph.json) auto-layout. Tool dock, shapes menu, edge inspector, prompt panel.
- **[backend](./backend)** — [Hono](https://hono.dev/) API that turns prompts into typed flowcharts via a Gemini flash-lite → Groq fallback chain. API keys are held server-side only.
- **[shared](./shared)** — `@floo/shared`: the flowchart model plus validation, structure repair, and natural-language edit application. Consumed by both sides.

## Features

- **Generate from a prompt** — describe a process; the model returns a typed flowchart (start, process, decision, input, output, loop, end, database, document, subprocess, manual, delay, text, media) that is validated and auto-laid-out.
- **Model fallback chain** — on hard failures only (timeout, bad JSON, API error): every `*-flash-lite` Gemini model your key can call, sorted newest version first, then Groq `openai/gpt-oss-120b`. Discovered at boot via `models.list` (no hardcoded Gemini ids); deprecated models that fail are skipped automatically. Quality issues do not advance the chain.
- **Oversimplification aid (optional)** — set `GEMINI_API_KEY` and detailed descriptions that come back too small are re-expanded by Gemini flash-lite (best-effort; the primary result is kept if expand fails, and a yellow notice tells you when it was used).
- **Edit with natural language** — with a diagram on the canvas, switch to _Edit diagram_ and describe a change. The backend diffs your current diagram against the proposed one and applies only structural changes (added/removed/renamed steps), telling you what changed.
- **Auto-layout** — ELK hierarchical layout; loopable charts get a zig-zag stagger so back-edges don't cross straight paths.
- **Fourteen node kinds** — twelve flowchart shapes in the Shapes menu, plus a free-floating text box and a media card as one-click dock buttons. Media accepts a pasted URL or a right-click upload.
- **Draw and erase** — a freehand pen with any colour and a 1–20px brush, plus an eraser, all on a separate ink layer that never interferes with node geometry.
- **Labels in place** — double-click any node to rename it right on the canvas, or double-click a connection to edit its label. Branching connectors auto-label: bottom outlet is _Yes/True_, right outlet is _No/False_.
- **Validation with warnings** — the model's output is checked (single start/end, connectedness, edges exist, labels present). Warnings are shown, not silently discarded.
- **JSON import/export** — share or back up diagrams as `.json`.

## Getting started

```sh
npm install
```

Configure the backend:

```sh
cp backend/.env.example backend/.env
# set GEMINI_API_KEY (preferred) and/or GROQ_API_KEY — at least one required
```

Run everything (backend API :3001 + frontend :5173, both with watch/HMR):

```sh
npm run dev
```

Open http://localhost:5173 and describe a process.

## Scripts

| Command                     | What it does                                    |
| --------------------------- | ----------------------------------------------- |
| `npm run dev`               | Backend (:3001) + frontend (:5173) concurrently |
| `npm run build`             | Build all workspaces                            |
| `npm run typecheck`         | `tsc --noEmit` across all workspaces            |
| `npm run lint` / `lint:fix` | ESLint (whole repo)                             |
| `npm run test`              | Vitest across all workspaces                    |
| `npm run format`            | Prettier over the repo                          |

## API

All API routes are under the backend on http://localhost:3001.

| Route                | Body                                         | Returns              |
| -------------------- | -------------------------------------------- | -------------------- |
| `GET /health`        | —                                            | `{ "status": "ok" }` |
| `POST /api/generate` | `{ "prompt": string, "context?" }`           | A `Flowchart`        |
| `POST /api/edit`     | `{ "prompt": string, "current": Flowchart }` | A `Flowchart`        |

The model's JSON output goes through a repair loop before being returned, so malformed output is corrected rather than failing the request. On hard failures the backend walks the fallback chain (dynamic `*-flash-lite` Gemini models, newest first → Groq). When `GEMINI_API_KEY` is set, responses expanded by the oversimplification aid include an `X-Floo-Aid: Gemini Flash-Lite` header, and the prompt panel shows a notice.

### Rate limits & input caps

| Guard                    | Default                                                                | Env                                             |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Generate/edit per IP     | 5 / minute (`429` + `Retry-After`)                                     | `RATE_LIMIT_PER_MIN` (0 disables)               |
| Shared Gemini RPM budget | 8 / minute across all flash-lite tiers — empty → skip Gemini, use Groq | `GEMINI_RPM`                                    |
| Concurrent LLM calls     | 2                                                                      | `MAX_CONCURRENT_LLM` (0 disables)               |
| Daily request budget     | unlimited                                                              | `DAILY_REQUEST_BUDGET` (UTC day, 0 = unlimited) |
| Prompt length            | ≤ 2000 chars                                                           | fixed                                           |
| Context                  | ≤ 3 items, ≤ 4000 chars each                                           | fixed                                           |

An upstream Gemini `429` blocks every Gemini tier for the retry window so the fallback chain jumps straight to Groq instead of walking the other Gemini models.

## Diagram model

A flowchart is just nodes and edges:

```ts
interface Flowchart {
  nodes: { id; type; label; position; metadata? }[]
  edges: { id; source; target; label? }[]
}
```

Node kinds: `start`, `process`, `decision`, `input`, `output`, `loop`, `end`, `database`, `document`, `subprocess`, `manual`, `delay`, plus `text` and `media`.

Every _shape_ exposes four ports — top, bottom, left, right. `text` and `media` are free-floating annotations with no ports, which is what `isFreeFloating` in `@floo/shared` encodes:

- **Top** — target (the flow's primary input)
- **Bottom** — source (primary output); the _Yes/True_ outlet on branch nodes
- **Left** — source _and_ target for loop-back returns: a return that starts below its target leaves from the left, so the line has one clean attachment on that side instead of dipping under the node
- **Right** — source (secondary outlet); the _No/False_ outlet on branch nodes

Loop-back edges are detected structurally (a back-edge in the DFS of the graph), so both `while`-style and `do-while`-style repetitions route correctly.

## Repository layout

```text
frontend/src/
  components/    FlowEditor, ShapesMenu, PromptPanel, EdgeInspector, ColorPicker, DrawLayer, FlooEdge
  nodes/         FlooNode shape components
  lib/           adapters (Flowchart <-> React Flow), layout (ELK + zig-zag), colour, ids, sample, exporters
backend/src/
  llm/           gemini adapter + models.list discovery + expand aid, groq adapter, prompts, content builders, fallback chain, generation + repair pipeline
shared/src/
  flowchart.ts   model + shape guard (isFreeFloating)
  validate.ts    structural validation
  repair.ts      id / label / structure repair heuristics
  applyEdit.ts   applies structural edits from the LLM to the current diagram
  heuristics.ts  shared oversimplification detection (frontend warning + backend aid)
```

Tests live beside their sources (Vitest). Milestones and design notes live in [MILESTONE.md](./MILESTONE.md).
