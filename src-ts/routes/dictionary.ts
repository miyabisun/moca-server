import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { dictionary } from '../db/schema.js'

const app = new Hono()

// 全件 (表記昇順の安定順)
app.get('/api/dictionary', (c) => {
  const rows = db.select().from(dictionary).orderBy(dictionary.surface).all()
  return c.json(rows)
})

// 追加 / 更新。surface が既存なら reading を上書き (upsert = 同表記の再登録は修正の意図)。
app.post('/api/dictionary', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const surface = typeof body.surface === 'string' ? body.surface.trim() : ''
  const reading = typeof body.reading === 'string' ? body.reading.trim() : ''
  if (!surface) return c.json({ error: 'surface required' }, 400)
  if (!reading) return c.json({ error: 'reading required' }, 400)

  const existing = db.select().from(dictionary).where(eq(dictionary.surface, surface)).get()
  const row = existing
    ? db.update(dictionary).set({ reading }).where(eq(dictionary.id, existing.id)).returning().get()
    : db.insert(dictionary).values({ surface, reading }).returning().get()
  return c.json(row, 201)
})

// 削除
app.delete('/api/dictionary/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const entry = db.select().from(dictionary).where(eq(dictionary.id, id)).get()
  if (!entry) return c.json({ error: 'not found' }, 404)

  db.delete(dictionary).where(eq(dictionary.id, id)).run()
  return c.json({ ok: true })
})

export default app
