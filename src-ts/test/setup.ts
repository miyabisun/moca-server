import fs from 'fs'
import os from 'os'
import path from 'path'

// Point DATABASE_PATH at a fresh temp file BEFORE any module (config.ts / db/index.ts)
// is loaded. bun test does not read .env, so without this the db module would open
// bun:sqlite at ./moca.db and pollute the repo. This preload runs before test files
// and their import chains, so the db opens an isolated, throwaway path.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moca-server-test-'))
process.env.DATABASE_PATH = path.join(dir, 'test.db')

// Create tables once for the shared test db (db opens the path set above).
const { init } = await import('../lib/init.js')
init()
