import 'dotenv/config'
import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { GroqAdapter } from './llm/groq.js'
import { createGenPipeline } from './llm/pipeline.js'

const apiKey = process.env.GROQ_API_KEY
if (!apiKey) {
  console.error('GROQ_API_KEY is not set. Set it in your environment or .env file.')
  process.exit(1)
}

const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const provider = new GroqAdapter(apiKey, model)
const app = createApp(createGenPipeline(provider))

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port })

console.log(`floo backend listening on http://localhost:${port}`)