// テキスト → 台本JSON の生成ロジック。
// /analyze ルートと、テキスト流し込み (演技モード) の両方から共有する。
// 挙動は元の app.ts 内 /analyze と同一 (プロンプト・リトライ・smoothScript まで揃える)。

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

// プロンプト全体 (指示 + テキスト) を stdin で受け取る
export const defaultAnalyzeCmd = ['claude', '-p', '--model', 'haiku']

export class AnalyzeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnalyzeError'
  }
}

// テキストを analyzeCmd に通して検証済みの台本JSONを返す。
// LLM は稀に JSON 以外を返すのでパースできるまで数回試し、駄目なら AnalyzeError を投げる。
export async function analyzeText(
  text: string,
  analyzeCmd: string[],
  carry = 1 / 3,
): Promise<Script> {
  let lastError = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    const proc = Bun.spawn(analyzeCmd, {
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
      lastError = `analyze command failed (${code}): ${err.slice(0, 500)}`
      console.error(lastError)
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
