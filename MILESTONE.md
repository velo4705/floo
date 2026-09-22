# Floo — Milestone Roadmap

AI Flowchart Maker. Type a process in plain English, get a chart. No manual shapes.

## Stack

- **Frontend:** React + Vite + React Flow (node/graph editor)
- **Backend:** Node.js (Hono/Express) — holds the Groq API key server-side
- **AI:** Groq API (hosted open-weight LLMs, e.g. Llama/Qwen) → structured flowchart JSON
- **Layout:** ELK / dagre deterministic auto-layout (routing, spacing, swimlanes)
- **Data:** Native flowchart JSON (React Flow format), fully editable on canvas

```
User's browser (React Flow)  ──►  Backend /generate  ──►  Groq API
```

## Positioning

The gap in the market: most tools are manual editors with an AI button bolted on. Floo is AI-first — the AI does the whole job, the manual editor is the fallback.

**Differentiators (see strategy analysis):**

1. **AI-first workflow** — AI is the product, not an afterthought (#1)
2. **Conversational editing** — edit an *existing* diagram in plain English; diff-and-apply preserves manual tweaks (#2)
3. **Clean auto-layout** — deterministic ELK/dagre layout removes arrow-crossing/text-overlap cleanup (#5)
4. **Doc context** — paste or upload SOPs/meeting notes as AI input, not just a one-line prompt (#3)
5. **Open data model** — JSON on canvas, exports to PNG/SVG/Mermaid — no DSL lock-in (#7)
6. **Generous free tier** — Groq inference is fractions of a cent per chart, so free usage is affordable (#6)

## Milestones

| # | Milestone                 | Goal                                                                                                   | Effort |
|---|---------------------------|--------------------------------------------------------------------------------------------------------|--------|
| M0 | Project scaffold          | Monorepo (React+Vite frontend, Node backend), TS, lint, CI, git setup                                  | 1      |
| M1 | Manual flowchart editor   | Drag-drop shapes, connect edges, pan/zoom, save/load JSON — validates React Flow canvas                | 3      |
| M2 | Auto-layout engine        | ELK/dagre layout: clean routing, spacing, swimlanes. Applied to every diagram. Highest ROI item (#5)   | 2      |
| M3 | AI first cut              | Backend POST /generate → Groq → schema-validated JSON (decision/branch/loop nodes) → renders clean     | 2      |
| M4 | Structure & repair        | Validate output, auto-fix malformed JSON, re-prompt for missing branches/loops — raises logic depth (#4)| 3      |
| M5 | Conversational editing    | Diff old vs. new diagram, apply in place preserving manual tweaks. Flagship differentiator (#2)         | 4      |
| M6 | Real users & context      | Auth, quotas, **doc/paste input as AI context**, generous free tier, rate limiting (#3, #6)            | 5      |
| M7 | Polish & export           | Export PNG/SVG/Mermaid, share links, templates, undo/redo (#7)                                         | 3      |
| M8 | Beta launch               | Deploy (Vercel/Railway), monitoring, abuse protection, feedback capture                                 | 3      |

**Total: ~26 effort units** — a weekend to a clean AI-generated chart (M1–M3), a few weeks to public beta.

## Notes

- **Progress:** M0–M4 complete. M4 added `validateFlowchart`/`repairFlowchart` in `@floo/shared` (deep structural checks + rule-based auto-fix) and a backend pipeline (`generate → validate → rule-repair → model re-prompt, max 2 retries`) wrapping the provider; the frontend shows non-blocking warnings from the same shared validator.

- M1 before M2: the manual editor validates the canvas before anything else exists.
- M2 before M3: layout first, so AI output is clean from day one, not after cleanup.
- M3–M5 are the core loop: "type a process → clean chart → refine it in conversation."
- M5 is the differentiator incumbents don't have — invest heaviest here.
- M4's validation/repair partially offsets the model ceiling on complex logic (#4); the rest is bounded by model capability.
- M6+ only matter once strangers use the app.
- Lock the model call behind a thin adapter so Groq can be swapped for self-hosted vLLM later.