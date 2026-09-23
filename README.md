# floo

An AI-first flowchart editor. Describe a process in plain language and Floo turns it into an editable flowchart — or tell it what to change and it edits the diagram you already have.

Built as a TypeScript monorepo with three workspaces:

- **[frontend](./frontend)** — React + [React Flow](https://reactflow.dev/), Vite dev server, [elkjs](https://raw.githubusercontent.com/OpenKieler/elkjs/master/doc/elkgraph.json) auto-layout. Shapes, palette, sidebar inspectors, prompt panel.
- **[backend](./backend)** — [Hono](https://hono.dev/) API that turns prompts into typed flowcharts via Groq. The API key is held server-side only.
- **[shared](./shared)** — `@floo/shared`: the flowchart model plus validation, structure repair, and natural-language edit application. Consumed by both sides.

## Features

- **Generate from a prompt** — describe a process; the model returns a typed flowchart (start, process, decision, input, output, loop, end) that is validated and auto-laid-out.
- **Edit with natural language** — with a diagram on the canvas, switch to *Edit diagram* and describe a change. The backend diffs your current diagram against the proposed one and applies only structural changes (added/removed/renamed steps), telling you what changed.
- **Auto-layout** — ELK hierarchical layout; loopable charts get a zig-zag stagger so back-edges don't cross straight paths.
- **Drag-and-drop palette** — seven node kinds with sensible default labels.
- **Labels everywhere** — select or double-click any node or connection to type its label. Branching connectors auto-label: bottom outlet is *Yes/True*, right outlet is *No/False*.
- **Validation with warnings** — the model's output is checked (single start/end, connectedness, edges exist, labels present). Warnings are shown, not silently discarded.
- **JSON import/export** — share or back up diagrams as `.json`.

## Getting started

```sh
npm install
```

Configure the backend:

```sh
cp backend/.env.example backend/.env
# set GROQ_API_KEY
```

Run everything (backend API :3001 + frontend :5173, both with watch/HMR):

```sh
npm run dev
```

Open http://localhost:5173 and describe a process.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend (:3001) + frontend (:5173) concurrently |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run lint` / `lint:fix` | ESLint (whole repo) |
| `npm run test` | Vitest across all workspaces |
| `npm run format` | Prettier over the repo |

## API

All API routes are under the backend on http://localhost:3001.

| Route | Body | Returns |
| --- | --- | --- |
| `GET /health` | — | `{ "status": "ok" }` |
| `POST /api/generate` | `{ "prompt": string, "context?" }` | A `Flowchart` |
| `POST /api/edit` | `{ "prompt": string, "current": Flowchart }` | A `Flowchart` |

The model's JSON output goes through a repair loop before being returned, so malformed output is corrected rather than failing the request.

## Diagram model

A flowchart is just nodes and edges:

```ts
interface Flowchart {
  nodes: { id, type, label, position, metadata? }[]
  edges: { id, source, target, label? }[]
}
```

Node kinds: `start`, `process`, `decision`, `input`, `output`, `loop`, `end`.

Every shape exposes four ports — top, bottom, left, right:

- **Top** — target (the flow's primary input)
- **Bottom** — source (primary output); the *Yes/True* outlet on branch nodes
- **Left** — source *and* target for loop-back returns: a return that starts below its target leaves from the left, so the line has one clean attachment on that side instead of dipping under the node
- **Right** — source (secondary outlet); the *No/False* outlet on branch nodes

Loop-back edges are detected structurally (a back-edge in the DFS of the graph), so both `while`-style and `do-while`-style repetitions route correctly.

## Repository layout

```
frontend/src/
  components/    FlowEditor, Palette, PromptPanel, Inspector(s)
  nodes/         FlooNode shape components
  lib/           adapters (Flowchart <-> React Flow), layout (ELK + zig-zag), ids, sample, exporters
backend/src/
  llm/           groq client, prompts, generation + repair pipeline, edit pipeline
shared/src/
  flowchart.ts   model + shape guard
  validate.ts    structural validation
  repair.ts      id / label / structure repair heuristics
  applyEdit.ts   applies structural edits from the LLM to the current diagram
```

Tests live beside their sources (Vitest). Milestones and design notes live in [MILESTONE.md](./MILESTONE.md).