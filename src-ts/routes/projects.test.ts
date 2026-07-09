import { describe, expect, test, beforeEach } from 'bun:test'
import { createApp } from '../app.js'
import { db } from '../db/index.js'
import { projects, lines } from '../db/schema.js'

const app = createApp({ sayCmd: ['cat'], renderCmd: ['cat'] })

beforeEach(() => {
  db.delete(lines).run()
  db.delete(projects).run()
})

const create = (name: string) =>
  app.request('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })

describe('projects CRUD', () => {
  test('作成→一覧→単体取得', async () => {
    const created = await (await create('物語A')).json()
    expect(created.id).toBeGreaterThan(0)
    expect(created.name).toBe('物語A')
    expect(created.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const list = await (await app.request('/api/projects')).json()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: created.id, name: '物語A', lineCount: 0 })

    const single = await (await app.request(`/api/projects/${created.id}`)).json()
    expect(single).toMatchObject({ id: created.id, name: '物語A' })
    expect(single.lines).toEqual([])
  })

  test('name なしは 400', async () => {
    const res = await create('   ')
    expect(res.status).toBe(400)
  })

  test('改名で updated_at が更新される', async () => {
    const created = await (await create('旧名')).json()
    const res = await app.request(`/api/projects/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '新名' }),
    })
    const updated = await res.json()
    expect(updated.name).toBe('新名')
  })

  test('存在しない project は 404', async () => {
    expect((await app.request('/api/projects/9999')).status).toBe(404)
  })

  test('削除で lines も cascade 削除される', async () => {
    const created = await (await create('消す')).json()
    await app.request(`/api/projects/${created.id}/lines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'announcer', text: '行1' }),
    })
    const del = await app.request(`/api/projects/${created.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)

    expect((await app.request(`/api/projects/${created.id}`)).status).toBe(404)
    // lines テーブルから当該プロジェクトの行が消えている
    const remaining = db.select().from(lines).all()
    expect(remaining).toEqual([])
  })
})
