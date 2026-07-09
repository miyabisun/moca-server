import { init } from './lib/init.js'
import { createApp } from './app.js'

init()

const port = Number(process.env.PORT) || 3000
const app = createApp()

const backend = process.env.ANALYZE_BACKEND ?? 'none'
console.log(`moca-server running on http://localhost:${port}/ (analyze backend: ${backend})`)

export default { port, fetch: app.fetch }
