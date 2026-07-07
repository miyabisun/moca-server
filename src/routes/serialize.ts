import type { InferSelectModel } from 'drizzle-orm'
import type { lines } from '../db/schema.js'

type LineRow = InferSelectModel<typeof lines>

// DB 行 → API 形状。script は文字列で保持しているので構造化して返す。
export function serializeLine(row: LineRow) {
  return { ...row, script: row.script ? JSON.parse(row.script) : null }
}
