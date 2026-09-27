<div align="center">
  <h1>Floo</h1>

  <p><i>An AI Flowchart Maker -- Makes up complex, systematic flowcharts with just a prompt.</i></p>

  <a href="https://flooai.vercel.app/"><b>Try Floo here!</b></a>
</div>

---

## How this works

It's simple: **Describe a process** in your natural language, and Floo converts it into an **editable flowchart** -- or you can edit the same diagram too, either manually or by using AI.

This is simply designed for all flowcharts, including complex ones.

### Features

- A Main panel (on the left) holding **Select, Draw, Eraser, Image, Text and Shapes.**
- **Color picker** for the Draw tool (including Brush size).
- A **Prompt panel** that lets you describe what you want to do.
- A **Minimap** that shows you where you are in the diagram.
- Rename nodes or connections by double-clicking them.
- **Undo or Redo changes**, or you can **clear** everything.
- Export the diagram as a **PNG or JPG, or as JSON.**
- **Auto-layout** nodes in case its not arranged manually.
- Classic Light and Dark themes, with softening of colors.
- Minimal, just enough features for flowchart editing.

There are **Fourteen** node kinds: `start`, `process`, `decision`, `input`, `output`, `loop`, `end`, `database`, `document`, `subprocess`, `manual`, `delay`, plus `text` and `media`.

`text` and `media` are the only free-floating nodes with no ports, and are available from the main panel.

### Currently Supported Providers
- Groq (openai/gpt-oss-120b)
- Gemini (All `*-flash-lite` variants)


## Keybinds

| Shortcut                                                                                            | Does                                                                       |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd>                                                   | Send the prompt                                                            |
| <kbd>Enter</kbd>                                                                                    | Commit a label you're editing                                              |
| <kbd>Esc</kbd>                                                                                      | Cancel a label edit, or close an open menu                                 |
| <kbd>Backspace</kbd> / <kbd>Delete</kbd>                                                            | Delete the selected node, connection or ink stroke                         |
| <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd>                                                       | Undo                                                                       |
| <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd>, or <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Redo                                                                       |
| Arrow keys                                                                                          | Steer the colour picker — the saturation/value square, then the hue slider |

Canvas shortcuts stand down while you're typing in a field, so <kbd>Backspace</kbd> still edits text instead of deleting anything.

## Rate limits

| Guard                    | Default                                                                | Env                                             |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Generate/edit per IP     | 5 / minute (`429` + `Retry-After`)                                     | `RATE_LIMIT_PER_MIN` (0 disables)               |
| Shared Gemini RPM budget | 8 / minute across all flash-lite tiers — empty → skip Gemini, use Groq | `GEMINI_RPM`                                    |
| Concurrent LLM calls     | 2                                                                      | `MAX_CONCURRENT_LLM` (0 disables)               |
| Daily request budget     | unlimited                                                              | `DAILY_REQUEST_BUDGET` (UTC day, 0 = unlimited) |
| Prompt length            | ≤ 2000 chars                                                           | fixed                                           |
| Context                  | ≤ 3 items, ≤ 4000 chars each                                           | fixed                                           |

An upstream Gemini `429` blocks every Gemini tier for the retry window, so the chain jumps straight to Groq instead of walking the other models.

## Contributing

Check out the [contributing guidelines](https://github.com/floo-ai/floo/blob/main/CONTRIBUTING.md) to know how to get started.
