import { init } from './lib/init.js'
import { createApp } from './app.js'

init()

const port = Number(process.env.PORT) || 3000
const app = createApp()

console.log(`moca-server running on http://localhost:${port}/`)

export default { port, fetch: app.fetch }
