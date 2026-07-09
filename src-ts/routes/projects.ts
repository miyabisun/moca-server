import { Hono } from 'hono'
import { eq, desc, count } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects, lines } from '../db/schema.js'
import { serializeLine } from './serialize.js'

const app = new Hono()

// 一覧: リストペイン用に行数と updated_at を付ける
app.get('/api/projects', (c) => {
  const rows = db
    .select({
      id: projects.id,
      name: projects.name,
      created_at: projects.created_at,
      updated_at: projects.updated_at,
      lineCount: count(lines.id),
    })
    .from(projects)
    .leftJoin(lines, eq(lines.project_id, projects.id))
    .groupBy(projects.id)
    .orderBy(desc(projects.updated_at))
    .all()
  return c.json(rows)
})

// 作成
app.post('/api/projects', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'name required' }, 400)

  const row = db.insert(projects).values({ name }).returning().get()
  return c.json(row, 201)
})

// 単体 + その行を position 昇順で
app.get('/api/projects/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const project = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!project) return c.json({ error: 'not found' }, 404)

  const rows = db
    .select()
    .from(lines)
    .where(eq(lines.project_id, id))
    .orderBy(lines.position)
    .all()
  return c.json({ ...project, lines: rows.map(serializeLine) })
})

// 改名 (updated_at 更新)
app.patch('/api/projects/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const body = await c.req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'name required' }, 400)

  const row = db
    .update(projects)
    .set({ name, updated_at: new Date().toISOString() })
    .where(eq(projects.id, id))
    .returning()
    .get()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

// 削除 (lines も cascade 削除)
app.delete('/api/projects/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const project = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!project) return c.json({ error: 'not found' }, 404)

  db.transaction((tx) => {
    tx.delete(lines).where(eq(lines.project_id, id)).run()
    tx.delete(projects).where(eq(projects.id, id)).run()
  })
  return c.json({ ok: true })
})

export default app
