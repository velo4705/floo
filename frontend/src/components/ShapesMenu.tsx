import { isFreeFloating, type NodeKind } from '@floo/shared'
import { NODE_KINDS } from '../lib/adapters'
import { defaultLabel } from '../lib/ids'

// Shapes are the flowchart notation — the kinds that carry edges. Text and Media
// are free-floating content and live in the dock instead, so the grouping is
// driven by the same rule that decides which nodes get ports.
const SHAPES: { kind: NodeKind; label: string }[] = NODE_KINDS.filter(
  (kind) => !isFreeFloating(kind),
).map((kind) => ({ kind, label: defaultLabel(kind) }))

interface ShapesMenuProps {
  onAdd: (kind: NodeKind) => void
}

export function ShapesMenu({ onAdd }: ShapesMenuProps) {
  return (
    <div className="floo-dock__menu floo-dock__menu--shapes" role="menu" aria-label="Shapes">
      {SHAPES.map((item) => (
        <button
          key={item.kind}
          type="button"
          role="menuitem"
          className="floo-dock__shape"
          onClick={() => onAdd(item.kind)}
        >
          <span className={`palette__swatch palette__swatch--${item.kind}`} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
