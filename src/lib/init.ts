import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'

// drizzle-kit の実行時マイグレーションは使わず、起動時に raw SQL でテーブルを作る
// (comic-server の init() と同じ方針)。日時は ISO8601 文字列で統一。
export function init() {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL,
      mode TEXT NOT NULL,
      text TEXT NOT NULL,
      script TEXT
    )
  `)
  db.run(sql`CREATE INDEX IF NOT EXISTS lines_project_position_idx ON lines(project_id, position)`)
}
