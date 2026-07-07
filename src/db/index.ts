import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema.js'
import { databasePath } from '../lib/config.js'

const sqlite = new Database(databasePath)
sqlite.exec('PRAGMA journal_mode = WAL')
sqlite.exec('PRAGMA synchronous = NORMAL')
sqlite.exec('PRAGMA foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { sqlite }
