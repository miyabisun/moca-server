import { describe, expect, test, beforeEach } from 'bun:test'
import { createApp } from '../app.js'
import { db } from '../db/index.js'
import { projects, lines } from '../db/schema.js'

const app = createApp({ sayCmd: ['cat'], renderCmd: ['cat'] })

let projectId: number

beforeEach(async () => {
  db.delete(lines).run()
  db.delete(projects).run()
  const p = await (
    await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'テスト' }),
    })
  ).json()
  projectId = p.id
})

const addLine = (body: object) =>
  app.request(`/api/projects/${projectId}/lines`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const patchLine = (id: number, body: object) =>
  app.request(`/api/lines/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('lines CRUD', () => {
  test('追加は末尾 position で入り、script は構造化されて返る', async () => {
    const a = await (await addLine({ mode: 'announcer', text: 'いち' })).json()
    const b = await (await addLine({ mode: 'announcer', text: 'に' })).json()
    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
    expect(a.script).toBeNull()

    const script = [{ text: 'こんにちは。', emotion: { honwaka: 60 } }]
    const c = await (await addLine({ mode: 'acting', text: 'さん', script })).json()
    expect(c.mode).toBe('acting')
    expect(c.script).toEqual(script)
  })

  test('text なしは 400', async () => {
    expect((await addLine({ mode: 'announcer', text: '  ' })).status).toBe(400)
  })

  test('PATCH で不正な script は 400 (validateScript を通す)', async () => {
    const line = await (await addLine({ mode: 'announcer', text: 'x' })).json()
    // 空配列は validateScript が弾く
    expect((await patchLine(line.id, { script: [] })).status).toBe(400)
    // text 欠落の segment も弾く
    expect((await patchLine(line.id, { script: [{ emotion: { angry: 1 } }] })).status).toBe(400)
  })

  test('PATCH で有効な script は保存され構造化されて返る', async () => {
    const line = await (await addLine({ mode: 'announcer', text: 'x' })).json()
    const script = [{ text: 'やあ。', emotion: { angry: 80 } }]
    const res = await patchLine(line.id, { mode: 'acting', script })
    const updated = await res.json()
    expect(updated.mode).toBe('acting')
    expect(updated.script).toEqual(script)
  })

  test('削除', async () => {
    const line = await (await addLine({ mode: 'announcer', text: 'x' })).json()
    expect((await app.request(`/api/lines/${line.id}`, { method: 'DELETE' })).status).toBe(200)
    const single = await (await app.request(`/api/projects/${projectId}`)).json()
    expect(single.lines).toEqual([])
  })

  test('並び順一括更新', async () => {
    const a = await (await addLine({ mode: 'announcer', text: 'A' })).json()
    const b = await (await addLine({ mode: 'announcer', text: 'B' })).json()
    const c = await (await addLine({ mode: 'announcer', text: 'C' })).json()

    const res = await app.request(`/api/projects/${projectId}/lines/order`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order: [c.id, a.id, b.id] }),
    })
    const reordered = await res.json()
    expect(reordered.map((r: { text: string }) => r.text)).toEqual(['C', 'A', 'B'])
    expect(reordered.map((r: { position: number }) => r.position)).toEqual([0, 1, 2])
  })

  test('並び順に他プロジェクトの id が混ざると 400', async () => {
    const a = await (await addLine({ mode: 'announcer', text: 'A' })).json()
    const res = await app.request(`/api/projects/${projectId}/lines/order`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order: [a.id, 99999] }),
    })
    expect(res.status).toBe(400)
  })
})
