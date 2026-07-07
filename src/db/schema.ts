import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// プロジェクト = 台本行の順序付きリスト。音声は保持せず、テキストと台本JSONだけを持つ。
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// 行 = 聴く/編集の最小単位。mode でアナウンサー(プレーン) か演技(台本JSON) を区別する。
// script は台本JSON を JSON.stringify した文字列。announcer 行は null。
export const lines = sqliteTable('lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  project_id: integer('project_id').notNull().references(() => projects.id),
  position: integer('position').notNull(),
  mode: text('mode', { enum: ['announcer', 'acting'] }).notNull(),
  text: text('text').notNull(),
  script: text('script'),
}, (t) => ({
  projectPositionIdx: index('lines_project_position_idx').on(t.project_id, t.position),
}))
