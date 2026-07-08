import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq, and, gt, max, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects, lines } from '../db/schema.js'
import { ScriptError, validateScript } from '../script.js'
import { analyzeText } from '../analyze.js'
import { serializeLine } from './serialize.js'

const app = new Hono()

const nowIso = () => new Date().toISOString()

function touchProject(projectId: number) {
  db.update(projects).set({ updated_at: nowIso() }).where(eq(projects.id, projectId)).run()
}

function nextPosition(projectId: number): number {
  const row = db
    .select({ value: max(lines.position) })
    .from(lines)
    .where(eq(lines.project_id, projectId))
    .get()
  return (row?.value ?? -1) + 1
}

// script (配列) を検証して保存用文字列にする。不正なら ScriptError を投げる。
function serializeScript(input: unknown): string {
  return JSON.stringify(validateScript(input))
}

// 行追加 (position は末尾)
app.post('/api/projects/:id/lines', async (c) => {
  const projectId = Number(c.req.param('id'))
  if (Number.isNaN(projectId)) return c.json({ error: 'invalid id' }, 400)

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) return c.json({ error: 'not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const mode = body.mode === 'acting' ? 'acting' : 'announcer'
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return c.json({ error: 'text required' }, 400)

  let script: string | null = null
  if (mode === 'acting' && body.script != null) {
    try {
      script = serializeScript(body.script)
    } catch (e) {
      return c.json({ error: e instanceof ScriptError ? e.message : 'invalid script' }, 400)
    }
  }

  const row = db
    .insert(lines)
    .values({ project_id: projectId, position: nextPosition(projectId), mode, text, script })
    .returning()
    .get()
  touchProject(projectId)
  return c.json(serializeLine(row), 201)
})

// 行更新 (text / script / mode)。script は validateScript を通してから保存 (不正は 400)。
app.patch('/api/lines/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const line = db.select().from(lines).where(eq(lines.id, id)).get()
  if (!line) return c.json({ error: 'not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const patch: Partial<typeof lines.$inferInsert> = {}

  if (typeof body.text === 'string') {
    const t = body.text.trim()
    if (!t) return c.json({ error: 'text must not be empty' }, 400)
    patch.text = t
  }
  if (body.mode === 'announcer' || body.mode === 'acting') {
    patch.mode = body.mode
  }
  if ('script' in body) {
    if (body.script == null) {
      patch.script = null
    } else {
      try {
        patch.script = serializeScript(body.script)
      } catch (e) {
        return c.json({ error: e instanceof ScriptError ? e.message : 'invalid script' }, 400)
      }
    }
  }

  const row = db.update(lines).set(patch).where(eq(lines.id, id)).returning().get()
  touchProject(line.project_id)
  return c.json(serializeLine(row))
})

// 行複製。mode/text/script ごとコピーして対象行の直下 (position+1) に挿入する。
// 感情パラメータの A/B 比較用。挿入前に後続 position を +1 シフトする。
app.post('/api/lines/:id/duplicate', (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const line = db.select().from(lines).where(eq(lines.id, id)).get()
  if (!line) return c.json({ error: 'not found' }, 404)

  const row = db.transaction((tx) => {
    tx.update(lines)
      .set({ position: sql`${lines.position} + 1` })
      .where(and(eq(lines.project_id, line.project_id), gt(lines.position, line.position)))
      .run()
    return tx
      .insert(lines)
      .values({
        project_id: line.project_id,
        position: line.position + 1,
        mode: line.mode,
        text: line.text,
        script: line.script,
      })
      .returning()
      .get()
  })
  touchProject(line.project_id)
  return c.json(serializeLine(row), 201)
})

// 行削除
app.delete('/api/lines/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'invalid id' }, 400)

  const line = db.select().from(lines).where(eq(lines.id, id)).get()
  if (!line) return c.json({ error: 'not found' }, 404)

  db.delete(lines).where(eq(lines.id, id)).run()
  touchProject(line.project_id)
  return c.json({ ok: true })
})

// 並び順一括更新 (id 配列を受け position を 0..n で振り直す)
app.put('/api/projects/:id/lines/order', async (c) => {
  const projectId = Number(c.req.param('id'))
  if (Number.isNaN(projectId)) return c.json({ error: 'invalid id' }, 400)

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) return c.json({ error: 'not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const order = Array.isArray(body.order) ? body.order.map(Number) : null
  if (!order || order.some(Number.isNaN)) return c.json({ error: 'order must be an array of ids' }, 400)

  const existing = db.select({ id: lines.id }).from(lines).where(eq(lines.project_id, projectId)).all()
  const existingIds = new Set(existing.map((r) => r.id))
  if (order.length !== existingIds.size || order.some((oid: number) => !existingIds.has(oid))) {
    return c.json({ error: 'order must contain exactly the ids of this project' }, 400)
  }

  db.transaction((tx) => {
    order.forEach((lineId: number, index: number) => {
      tx.update(lines).set({ position: index }).where(eq(lines.id, lineId)).run()
    })
  })
  touchProject(projectId)

  const rows = db.select().from(lines).where(eq(lines.project_id, projectId)).orderBy(lines.position).all()
  return c.json(rows.map(serializeLine))
})

// テキスト流し込み。改行で分割し空行は無視。
//   announcer: 全行を一括 insert して JSON で即返す。
//   acting:    1行ずつ analyze しながら SSE で進捗を push (失敗行は announcer として保存)。
app.post('/api/projects/:id/import', async (c) => {
  const projectId = Number(c.req.param('id'))
  if (Number.isNaN(projectId)) return c.json({ error: 'invalid id' }, 400)

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) return c.json({ error: 'not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const mode = body.mode === 'acting' ? 'acting' : 'announcer'
  const texts = String(body.text ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  // `after` (行id) 指定時はその行の直後に挿入する。指定が無い / 他プロジェクトの行なら
  // 現行どおり末尾追加 (完全後方互換)。挿入本数ぶん後続 position を +1 シフトしてから
  // startPos = after行.position + 1 で詰める。
  let startPos = nextPosition(projectId)
  if (body.after != null && texts.length > 0) {
    const afterId = Number(body.after)
    const afterRow = Number.isNaN(afterId)
      ? undefined
      : db.select().from(lines).where(eq(lines.id, afterId)).get()
    if (afterRow && afterRow.project_id === projectId) {
      db.update(lines)
        .set({ position: sql`${lines.position} + ${texts.length}` })
        .where(and(eq(lines.project_id, projectId), gt(lines.position, afterRow.position)))
        .run()
      startPos = afterRow.position + 1
    }
  }

  if (mode === 'announcer') {
    if (texts.length === 0) return c.json({ mode, created: [] })
    const created = db
      .insert(lines)
      .values(texts.map((text, i) => ({
        project_id: projectId,
        position: startPos + i,
        mode: 'announcer' as const,
        text,
        script: null,
      })))
      .returning()
      .all()
    touchProject(projectId)
    return c.json({ mode, created: created.map(serializeLine) })
  }

  // acting: SSE で 1行ずつ進捗を流す
  const analyzeCmd = c.get('analyzeCmd')
  return streamSSE(c, async (stream) => {
    const total = texts.length
    for (let i = 0; i < total; i++) {
      if (stream.aborted) break // client disconnected — saved rows remain
      const text = texts[i]
      let lineMode: 'announcer' | 'acting' = 'acting'
      let script: string | null = null
      try {
        script = JSON.stringify(await analyzeText(text, analyzeCmd))
      } catch {
        // 分析失敗は announcer 行として保存し、データを失わない
        lineMode = 'announcer'
        script = null
      }
      const row = db
        .insert(lines)
        .values({ project_id: projectId, position: startPos + i, mode: lineMode, text, script })
        .returning()
        .get()
      await stream.writeSSE({
        data: JSON.stringify({
          index: i + 1,
          total,
          status: lineMode === 'acting' ? 'done' : 'failed',
          line: serializeLine(row),
        }),
      })
    }
    if (total > 0) touchProject(projectId)
    await stream.writeSSE({ event: 'complete', data: JSON.stringify({ total }) })
  })
})

export default app
