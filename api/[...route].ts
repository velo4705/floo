import { getRequestListener } from '@hono/node-server'

import { backendConfigFromEnv, createBackend } from '../backend/src/backend.js'

import type { IncomingMessage, ServerResponse } from 'node:http'

const backend = createBackend(backendConfigFromEnv())
const listener = getRequestListener(backend.app.fetch)

if (!backend.fatal) {
  void backend.init().then(
    (info) => {
      for (const line of backend.describe(info)) {
        console.log(line)
      }
    },
    (err: unknown) => {
      console.warn(err instanceof Error ? err.message : String(err))
    },
  )
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  listener(req, res)
}
