import { describe, expect, test } from 'bun:test'
import { createApp } from './app.js'
import { MOCA_FORMAT, wavHeader } from './wav.js'

// cat は stdin をそのまま stdout に返すので、合成エンジンの代役になる
const FAKE_SCRIPT = '[{"text":"こんにちは。","emotion":{"honwaka":60}}]'
const app = createApp({
  sayCmd: ['cat'],
  renderCmd: ['cat'],
  // 入力を読み捨てて固定の台本JSONを返す analyzer のモック
  analyzeCmd: ['sh', '-c', `cat > /dev/null; echo '${FAKE_SCRIPT}'`],
})

const bodyAfterHeader = async (res: Response) => {
  const body = new Uint8Array(await res.arrayBuffer())
  expect(body.slice(0, 44)).toEqual(wavHeader(MOCA_FORMAT))
  return new TextDecoder().decode(body.slice(44))
}

describe('GET /', () => {
  // SPA 未ビルドでもテストが通るよう index シェルを注入する
  const spa = createApp({
    sayCmd: ['cat'],
    renderCmd: ['cat'],
    getIndexHtml: () => '<!doctype html><title>宮舞モカ</title>',
  })

  test('管理画面 SPA の index を返す', async () => {
    const res = await spa.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('宮舞モカ')
  })
})

describe('/say (text)', () => {
  test('テキストなしは 400', async () => {
    const res = await app.request('/say', { method: 'POST', body: '  ' })
    expect(res.status).toBe(400)
  })

  test('POST: WAV ヘッダ + PCM が返る', async () => {
    const res = await app.request('/say', { method: 'POST', body: 'hello' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/wav')
    expect(await bodyAfterHeader(res)).toBe('hello')
  })

  test('GET: クエリパラメータでも同じ結果', async () => {
    const res = await app.request('/say?text=hi')
    expect(await bodyAfterHeader(res)).toBe('hi')
  })
})

describe('/say (json)', () => {
  const post = (body: string) =>
    app.request('/say', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })

  test('台本JSONは JSONL に変換されて render に渡る', async () => {
    const res = await post(FAKE_SCRIPT)
    expect(res.status).toBe(200)
    expect(await bodyAfterHeader(res)).toBe(
      '{"text":"こんにちは。","emotion":{"honwaka":60}}\n',
    )
  })

  test('壊れた JSON は 400', async () => {
    expect((await post('[oops')).status).toBe(400)
    expect((await post('[]')).status).toBe(400)
    expect((await post('[{"emotion":{"angry":1}}]')).status).toBe(400)
  })
})

describe('POST /analyze', () => {
  test('テキストなしは 400', async () => {
    const res = await app.request('/analyze', { method: 'POST', body: '' })
    expect(res.status).toBe(400)
  })

  test('検証済みの台本JSON (配列) を返す', async () => {
    const res = await app.request('/analyze', { method: 'POST', body: 'こんにちは。' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ text: 'こんにちは。', emotion: { honwaka: 60 } }])
  })

  test('analyzer が JSON を返さなければ 502', async () => {
    const broken = createApp({
      sayCmd: ['cat'],
      renderCmd: ['cat'],
      analyzeCmd: ['sh', '-c', 'cat > /dev/null; echo ごめんなさい'],
    })
    const res = await broken.request('/analyze', { method: 'POST', body: 'a' })
    expect(res.status).toBe(502)
  })
})

describe('合成の直列化', () => {
  test('同時リクエストでも壊れない', async () => {
    const results = await Promise.all(
      ['a', 'b', 'c'].map((t) =>
        app.request('/say', { method: 'POST', body: t }).then(bodyAfterHeader),
      ),
    )
    expect(results).toEqual(['a', 'b', 'c'])
  })
})

describe('wavHeader', () => {
  test('44 バイトで RIFF/WAVE マジックを含む', () => {
    const h = wavHeader(MOCA_FORMAT)
    expect(h.length).toBe(44)
    expect(new TextDecoder().decode(h.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(h.slice(8, 12))).toBe('WAVE')
  })
})
