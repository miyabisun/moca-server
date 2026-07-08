import { describe, expect, test } from 'bun:test'
import { createApp } from '../app.js'

// SSE 本文ブロックから data 行のテキストだけ拾う (heartbeat コメント行は無視)。
function dataLines(chunk: string): string[] {
  return chunk
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
}

// 永続ストリームは閉じないので res.text() だと永久ハングする。
// reader で data 行が来るまで1チャンクずつ読む。
async function readData(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) throw new Error('stream closed before data arrived')
    const lines = dataLines(decoder.decode(value))
    if (lines.length > 0) return lines[0]
  }
}

describe('通知 pub/sub (/notify)', () => {
  test('2購読 → 1発火 → 両方が同じテキストを受信', async () => {
    const app = createApp({ sayCmd: ['cat'], renderCmd: ['cat'] })

    const sub1 = await app.request('/notify/stream')
    const sub2 = await app.request('/notify/stream')
    expect(sub1.headers.get('content-type')).toContain('text/event-stream')
    const r1 = sub1.body!.getReader()
    const r2 = sub2.body!.getReader()

    const post = await app.request('/notify', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'テスト通知',
    })
    expect(post.status).toBe(204)

    expect(await readData(r1)).toBe('テスト通知')
    expect(await readData(r2)).toBe('テスト通知')

    await r1.cancel()
    await r2.cancel()
  })

  test('空文字の POST は 400', async () => {
    const app = createApp({ sayCmd: ['cat'], renderCmd: ['cat'] })
    const res = await app.request('/notify', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '',
    })
    expect(res.status).toBe(400)
  })

  test('購読者ゼロでも 204 (fire-and-forget)', async () => {
    const app = createApp({ sayCmd: ['cat'], renderCmd: ['cat'] })
    const res = await app.request('/notify', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '誰も聞いていない',
    })
    expect(res.status).toBe(204)
  })
})
