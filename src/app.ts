import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { logger } from 'hono/logger'
import { MOCA_FORMAT, wavHeader } from './wav.js'
import { ScriptError, validateScript, toJsonl } from './script.js'
import { AnalyzeError, createAnalyzerFromEnv } from './analyze.js'
import type { Analyzer } from './analyze.js'
import { getIndexHtml as realGetIndexHtml } from './lib/spa.js'
import projects from './routes/projects.js'
import lines from './routes/lines.js'
import dictionary from './routes/dictionary.js'
import { applyDictionary, loadDictionary } from './dictionary.js'

export interface CreateAppOptions {
  // プレーンテキスト合成コマンド。テキストを stdin で受け取り、生PCM (s16le/48k/mono) を stdout に吐く
  sayCmd?: string[]
  // 台本合成コマンド。JSONL (1行=1segment) を stdin で受け取り、生PCM を stdout に吐く
  renderCmd?: string[]
  // 感情分析 backend。テキストを受け取り検証済みの台本 JSON を返す。
  // 省略時は環境変数 (ANALYZE_BACKEND ほか) から自動生成。
  analyzer?: Analyzer
  // 管理画面 SPA の静的アセット配信ルート (テスト注入用)
  staticRoot?: string
  // index.html を返す関数 (テスト注入用)。null なら未ビルドとして 404
  getIndexHtml?: () => string | null
}

const bin = (name: string) => [`${import.meta.dir}/../bin/${name}`]

// VOICEPEAK は多重起動が不安定なので、合成はサーバー全体で直列化する
let synthLock: Promise<void> = Promise.resolve()

export function createApp({
  sayCmd = bin('moca-say'),
  renderCmd = bin('moca-render'),
  analyzer,
  staticRoot = './client/build',
  getIndexHtml = realGetIndexHtml,
}: CreateAppOptions = {}): Hono {
  const app = new Hono()
  const resolvedAnalyzer = analyzer ?? createAnalyzerFromEnv()

  app.use(logger())

  // 流し込み (演技モード) ルートが analyzer を参照できるよう context に載せる
  app.use('*', async (c, next) => {
    c.set('analyzer', resolvedAnalyzer)
    await next()
  })

  // テキスト → 台本JSON (感情パラメータの自動生成)。
  // ?carry=0〜0.9 で前の文の感情をどれだけ引きずるか指定 (デフォルト 1/3、0で無効)
  app.post('/analyze', async (c) => {
    const text = await c.req.text()
    if (!text.trim()) return c.text('text required', 400)

    const carryParam = c.req.query('carry')
    const carry = carryParam == null ? 1 / 3 : Number(carryParam)
    if (Number.isNaN(carry) || carry < 0 || carry > 0.9) {
      return c.text('carry must be a number between 0 and 0.9', 400)
    }

    try {
      return c.json(await resolvedAnalyzer(text, carry))
    } catch (e) {
      if (e instanceof AnalyzeError) return c.text(e.message, 502)
      throw e
    }
  })

  // 合成して WAV をチャンク配信。
  //   text/plain        → そのまま読み上げ (感情なし)
  //   application/json  → 台本JSON ({"segments":[...]}) として感情付きで読み上げ
  app.on(['GET', 'POST'], '/say', async (c) => {
    let cmd: string[]
    let stdin: string

    const isJson =
      c.req.method === 'POST' &&
      (c.req.header('content-type') ?? '').includes('application/json')

    // 読み替え辞書は合成時のみ適用する入力前処理。マスターテキストは書き換えない。
    // (/analyze は一切適用しない = 原文を読む)。実際に適用する経路でのみロードする。
    if (isJson) {
      let script
      try {
        script = validateScript(await c.req.json())
      } catch (e) {
        const msg = e instanceof ScriptError ? e.message : 'invalid JSON body'
        return c.text(msg, 400)
      }
      cmd = renderCmd
      const entries = loadDictionary()
      stdin = toJsonl(script.map((seg) => ({ ...seg, text: applyDictionary(seg.text, entries) })))
    } else {
      const text =
        c.req.method === 'POST' ? await c.req.text() : (c.req.query('text') ?? '')
      if (!text.trim()) return c.text('text required', 400)
      cmd = sayCmd
      // ?raw=1 skips the dictionary: the 辞書 preview speaks a reading string
      // verbatim so applying the dictionary to it can't double-substitute.
      stdin = c.req.query('raw') ? text : applyDictionary(text, loadDictionary())
    }

    // 前の合成が終わるまで待ってから自分の合成を始める
    const prev = synthLock
    let release!: () => void
    synthLock = new Promise((resolve) => (release = resolve))
    await prev

    const proc = Bun.spawn(cmd, {
      stdin: new TextEncoder().encode(stdin),
      stdout: 'pipe',
      stderr: 'inherit',
    })
    proc.exited.finally(release)

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(wavHeader(MOCA_FORMAT))
        try {
          for await (const chunk of proc.stdout) {
            controller.enqueue(chunk)
          }
          const code = await proc.exited
          if (code !== 0) throw new Error(`say command exited with ${code}`)
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
      cancel() {
        // クライアントが切断したら合成も止める
        proc.kill()
      },
    })

    return new Response(stream, {
      headers: {
        'content-type': 'audio/wav',
        'cache-control': 'no-store',
      },
    })
  })

  // プロジェクト / 行 / 流し込みの CRUD API (全て /api プレフィクス)
  app.route('/', projects)
  app.route('/', lines)
  app.route('/', dictionary)

  // 管理画面 SPA: /assets/* は静的配信、それ以外の非API GET は index.html にフォールバック
  app.use('/assets/*', serveStatic({ root: staticRoot }))
  app.get('*', (c) => {
    const html = getIndexHtml()
    if (html) return c.html(html)
    return c.json({ error: 'Frontend not built. Run: bun run build:client' }, 404)
  })

  return app
}
