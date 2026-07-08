import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createApp } from '../app.js'
import { cliAnalyzer } from '../analyze.js'
import { db } from '../db/index.js'
import { projects, lines } from '../db/schema.js'

const FAKE_SCRIPT = '[{"text":"こんにちは。","emotion":{"honwaka":60}}]'

// analyzer を注入したアプリを作り、プロジェクトを1つ用意する
async function setup(analyzeCmd: string[]) {
  db.delete(lines).run()
  db.delete(projects).run()
  const app = createApp({
    sayCmd: ['cat'],
    renderCmd: ['cat'],
    analyzer: cliAnalyzer(analyzeCmd),
  })
  const p = await (
    await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'import' }),
    })
  ).json()
  return { app, projectId: p.id as number }
}

const importText = (app: ReturnType<typeof createApp>, projectId: number, body: object) =>
  app.request(`/api/projects/${projectId}/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

// SSE 本文を { event, data } の配列にパースする
function parseSSE(text: string) {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event: { event?: string; data?: unknown } = {}
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event.event = line.slice(6).trim()
        if (line.startsWith('data:')) event.data = JSON.parse(line.slice(5).trim())
      }
      return event
    })
}

describe('import (announcer)', () => {
  test('複数行を一括登録し、空行はスキップ', async () => {
    const { app, projectId } = await setup(['cat'])
    const res = await importText(app, projectId, {
      mode: 'announcer',
      text: '一行目\n\n  \n二行目\n三行目',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBe('announcer')
    expect(body.created.map((l: { text: string }) => l.text)).toEqual([
      '一行目',
      '二行目',
      '三行目',
    ])
    expect(body.created.every((l: { script: null }) => l.script === null)).toBe(true)
    expect(body.created.map((l: { position: number }) => l.position)).toEqual([0, 1, 2])
  })

  test('after 指定で対象行の直後に挿入され後続 position がずれる', async () => {
    const { app, projectId } = await setup(['cat'])
    const base = await (
      await importText(app, projectId, { mode: 'announcer', text: 'A\nB\nC' })
    ).json()
    const afterId = base.created[0].id // A の直後に入れる

    const res = await importText(app, projectId, {
      mode: 'announcer',
      text: 'X\nY',
      after: afterId,
    })
    const inserted = await res.json()
    expect(inserted.created.map((l: { position: number }) => l.position)).toEqual([1, 2])

    const single = await (await app.request(`/api/projects/${projectId}`)).json()
    expect(single.lines.map((l: { text: string }) => l.text)).toEqual(['A', 'X', 'Y', 'B', 'C'])
    expect(single.lines.map((l: { position: number }) => l.position)).toEqual([0, 1, 2, 3, 4])
  })

  test('after が他プロジェクトの行なら末尾追加にフォールバック', async () => {
    const { app, projectId } = await setup(['cat'])
    await importText(app, projectId, { mode: 'announcer', text: 'A\nB' })
    const res = await importText(app, projectId, {
      mode: 'announcer',
      text: 'Z',
      after: 99999,
    })
    const inserted = await res.json()
    expect(inserted.created[0].position).toBe(2) // 末尾
  })
})

describe('import (acting)', () => {
  test('SSE で行ごとに進捗を push し、acting 行として保存', async () => {
    const analyzeCmd = ['sh', '-c', `cat > /dev/null; echo '${FAKE_SCRIPT}'`]
    const { app, projectId } = await setup(analyzeCmd)
    const res = await importText(app, projectId, { mode: 'acting', text: '文一\n文二' })
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const events = parseSSE(await res.text())
    const progress = events.filter((e) => !e.event)
    expect(progress).toHaveLength(2)
    expect(progress[0].data).toMatchObject({ index: 1, total: 2, status: 'done' })
    expect(progress[1].data).toMatchObject({ index: 2, total: 2, status: 'done' })
    expect(events.at(-1)?.event).toBe('complete')

    const stored = db.select().from(lines).where(eq(lines.project_id, projectId)).all()
    expect(stored).toHaveLength(2)
    expect(stored.every((l) => l.mode === 'acting' && l.script != null)).toBe(true)
  })

  test('分析失敗行は announcer として保存されデータを失わない', async () => {
    // JSON を返さない analyzer → analyzeText が失敗する
    const analyzeCmd = ['sh', '-c', 'cat > /dev/null; echo ごめんなさい']
    const { app, projectId } = await setup(analyzeCmd)
    const res = await importText(app, projectId, { mode: 'acting', text: '失敗する文' })

    const events = parseSSE(await res.text())
    const progress = events.filter((e) => !e.event)
    expect(progress[0].data).toMatchObject({ status: 'failed' })

    const stored = db.select().from(lines).where(eq(lines.project_id, projectId)).all()
    expect(stored).toHaveLength(1)
    expect(stored[0].mode).toBe('announcer')
    expect(stored[0].text).toBe('失敗する文') // 元テキストが残る
    expect(stored[0].script).toBeNull()
  })
})
