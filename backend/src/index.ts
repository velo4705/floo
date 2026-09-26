import 'dotenv/config'
import { serve } from '@hono/node-server'

import { backendConfigFromEnv, createBackend } from './backend.js'

const port = Number(process.env.PORT ?? 3001)
const backend = createBackend(backendConfigFromEnv())

if (backend.fatal) {
  console.error(backend.fatal)
  process.exit(1)
}

void backend
  .init()
  .then((info) => {
    serve({ fetch: backend.app.fetch, port })

    for (const line of backend.describe(info)) {
      console.log(line)
    }
    console.log(`floo backend listening on http://localhost:${port}`)
  })
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
