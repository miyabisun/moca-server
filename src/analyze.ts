// テキスト → 台本JSON の生成ロジック。
// /analyze ルートと、テキスト流し込み (演技モード) の両方から共有する。
//
// backend は 3 種類 (ANALYZE_BACKEND で切替):
//   - cli    … 任意の LLM CLI を Bun.spawn で起動。stdin=プロンプト, stdout=台本JSON
//   - openai … OpenAI 互換の POST {base}/chat/completions を叩く
//   - none   … /analyze を無効化。呼ばれたら AnalyzeError

import { ScriptError, extractJson, smoothScript, validateScript } from './script.js'
import type { Script } from './script.js'

// 指示と変換対象テキストを結合して 1 つのプロンプトにする。
// 「テキストは後から渡す」形にすると LLM が指示の復唱だけして待ちに入ることがある
export const buildAnalyzePrompt = (text: string) => `以下のテキストを、音声合成ソフト VOICEPEAK の「宮舞モカ」で読み上げるための台本JSONに変換してください。

ルール:
- まずテキスト全体を読み、話者の基調となるトーン(基調感情)を決める
- テキストを文単位に分割し、文ごとに感情パラメータを推定して付与する。
  ただし各文の感情は基調感情を土台にし、文単位で完全に切り替えない。
  本文が明確に要求する場合以外、隣り合う文でトーンを急変させないこと
  (例: 疲れた発言の直後の文は、内容が前向きでも明るさを抑えて余韻を残す)
- 感情軸は bosoboso(ぼそぼそ・陰気), doyaru(ドヤ顔・得意げ), honwaka(ほんわか・優しい), angry(怒り), teary(涙声・悲しい) の5種で、値は0〜100
- 使う軸だけを含める。平坦な文は emotion 自体を省略してよい
- 必要に応じて speed(50-200, 標準100), pitch(-300〜300, 標準0), pause(文の後の無音ms) も付与できる
- 出力はJSON配列のみ。コードフェンスや説明文は一切付けない

出力スキーマ (1要素 = 1文):
[{"text":"文","emotion":{"angry":80},"speed":110,"pitch":0,"pause":300}]

変換対象のテキスト:
${text}`

export class AnalyzeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnalyzeError'
  }
}

// 呼び出し側から見た共通インタフェース。carry は感情の引きずり量 (0-0.9, 既定 1/3)。
export type Analyzer = (text: string, carry?: number) => Promise<Script>

// LLM 出力を JSON として検証し、パースに失敗したら 1 回だけ再試行する共通ループ。
async function withRetry(
  fetchOutput: () => Promise<string>,
  carry: number,
): Promise<Script> {
  let lastError = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    let out: string
    try {
      out = await fetchOutput()
    } catch (e) {
      lastError = (e as Error).message
      console.error(`${lastError} (attempt ${attempt})`)
      continue
    }
    try {
      return smoothScript(validateScript(extractJson(out)), carry)
    } catch (e) {
      if (!(e instanceof ScriptError)) throw e
      lastError = `analyzer returned an invalid script: ${e.message}`
      console.error(`${lastError} (attempt ${attempt})`)
    }
  }
  throw new AnalyzeError(lastError)
}

// CLI backend。stdin にプロンプト、stdout から台本 JSON を回収する。
export function cliAnalyzer(cmd: string[]): Analyzer {
  return (text, carry = 1 / 3) =>
    withRetry(async () => {
      const proc = Bun.spawn(cmd, {
        stdin: new TextEncoder().encode(buildAnalyzePrompt(text)),
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      if (code !== 0) {
        throw new Error(`analyze command failed (${code}): ${err.slice(0, 500)}`)
      }
      return out
    }, carry)
}

// OpenAI 互換 backend。OpenAI 本家 / Groq / LM Studio / Ollama /v1 / vLLM / LocalAI などに共通で通る。
export function openaiAnalyzer(opts: {
  apiBase: string
  apiKey: string
  model: string
}): Analyzer {
  const url = `${opts.apiBase.replace(/\/+$/, '')}/chat/completions`
  return (text, carry = 1 / 3) =>
    withRetry(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: 'user', content: buildAnalyzePrompt(text) }],
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`openai backend failed (${res.status}): ${body.slice(0, 500)}`)
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      return data.choices?.[0]?.message?.content ?? ''
    }, carry)
}

// 無効化 backend。/analyze を呼ばれても常に AnalyzeError (→ 502)。
export function noneAnalyzer(): Analyzer {
  return async () => {
    throw new AnalyzeError(
      'analyze backend is disabled (set ANALYZE_BACKEND=cli or openai in .env)',
    )
  }
}

// 環境変数から backend を組み立てる。既定は none (課金・CLI起動を意図せず走らせない安全側)。
export function createAnalyzerFromEnv(env: NodeJS.ProcessEnv = process.env): Analyzer {
  const backend = env.ANALYZE_BACKEND ?? 'none'
  if (backend === 'none') return noneAnalyzer()
  if (backend === 'cli') {
    const cmdStr = (env.ANALYZE_CMD ?? 'claude -p --model haiku').trim()
    if (!cmdStr) {
      throw new Error('ANALYZE_CMD must not be empty when ANALYZE_BACKEND=cli')
    }
    // シェル経由で起動することでパイプ・クォート・環境変数展開を許容する。
    // (POSIX sh 前提。Windows は WSL/Git Bash 上で運用する想定)
    return cliAnalyzer(['sh', '-c', cmdStr])
  }
  if (backend === 'openai') {
    const { OPENAI_API_BASE, OPENAI_API_KEY, OPENAI_MODEL } = env
    if (!OPENAI_API_BASE || !OPENAI_API_KEY || !OPENAI_MODEL) {
      throw new Error(
        'ANALYZE_BACKEND=openai requires OPENAI_API_BASE, OPENAI_API_KEY, OPENAI_MODEL',
      )
    }
    return openaiAnalyzer({
      apiBase: OPENAI_API_BASE,
      apiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL,
    })
  }
  throw new Error(`unknown ANALYZE_BACKEND: ${backend} (expected: cli, openai, none)`)
}
