export function createId(): string {
  return crypto.randomUUID()
}

export function defaultLabel(kind: string): string {
  switch (kind) {
    case 'start':
      return 'Start'
    case 'end':
      return 'End'
    case 'decision':
      return 'Decision?'
    case 'input':
      return 'Input'
    case 'output':
      return 'Output'
    case 'loop':
      return 'Repeat'
    case 'text':
      return 'Text'
    case 'media':
      return 'Media'
    default:
      return 'Process'
  }
}