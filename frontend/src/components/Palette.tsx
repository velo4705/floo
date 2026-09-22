import type { NodeKind } from '@floo/shared'
import { NODE_KINDS } from '../lib/adapters'
import { defaultLabel } from '../lib/ids'

const PALETTE: { kind: NodeKind; label: string }[] = NODE_KINDS.map((kind) => ({
  kind,
  label: defaultLabel(kind),
}))

interface PaletteProps {
  onAdd: (kind: NodeKind) => void
}

export function Palette({ onAdd }: PaletteProps) {
  return (
    <aside className="palette" aria-label="Shape palette">
      <h2 className="palette__title">Shapes</h2>
      <p className="palette__hint">Drag onto the canvas, or click to add.</p>
      {PALETTE.map((item) => (
        <button
          key={item.kind}
          type="button"
          className={`palette__item palette__item--${item.kind}`}
          draggable
          onClick={() => onAdd(item.kind)}
          onDragStart={(e) => {
            e.dataTransfer.setData('application/floo', item.kind)
            e.dataTransfer.effectAllowed = 'move'
          }}
        >
          <span className={`palette__swatch palette__swatch--${item.kind}`} />
          <span>{item.label}</span>
        </button>
      ))}
    </aside>
  )
}