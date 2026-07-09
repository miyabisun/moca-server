import { describe, expect, test, beforeEach } from 'bun:test'
import { createApp } from '../app.js'
import { db } from '../db/index.js'
import { dictionary } from '../db/schema.js'

const app = createApp({ sayCmd: ['cat'], renderCmd: ['cat'] })

beforeEach(() => {
  db.delete(dictionary).run()
})

const post = (body: object) =>
  app.request('/api/dictionary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('dictionary CRUD', () => {
  test('登録して一覧に載る (表記昇順)', async () => {
    await post({ surface: 'GPU', reading: 'ジーピーユー' })
    await post({ surface: 'API', reading: 'エーピーアイ' })
    const rows = await (await app.request('/api/dictionary')).json()
    expect(rows.map((r: { surface: string }) => r.surface)).toEqual(['API', 'GPU'])
  })

  test('空 surface は 400', async () => {
    expect((await post({ surface: '  ', reading: 'よみ' })).status).toBe(400)
  })

  test('空 reading は 400', async () => {
    expect((await post({ surface: '表記', reading: '' })).status).toBe(400)
  })

  test('同 surface の再登録は reading を上書き (upsert)', async () => {
    const first = await (await post({ surface: 'ハード', reading: 'はーど' })).json()
    const second = await (await post({ surface: 'ハード', reading: 'かたい' })).json()
    expect(second.id).toBe(first.id) // 新規行は増えない
    const rows = await (await app.request('/api/dictionary')).json()
    expect(rows).toHaveLength(1)
    expect(rows[0].reading).toBe('かたい')
  })

  test('削除、存在しない id は 404', async () => {
    const row = await (await post({ surface: 'x', reading: 'エックス' })).json()
    expect((await app.request(`/api/dictionary/${row.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await app.request(`/api/dictionary/${row.id}`, { method: 'DELETE' })).status).toBe(404)
  })
})
