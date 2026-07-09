// 台本 (script) JSON のスキーマ検証と JSONL 変換。
// /analyze が生成し /say (application/json) が受け取る共通インターフェース。

export const EMOTIONS = ['bosoboso', 'doyaru', 'honwaka', 'angry', 'teary'] as const
export type Emotion = (typeof EMOTIONS)[number]

export interface Segment {
  text: string
  emotion?: Partial<Record<Emotion, number>>
  speed?: number
  pitch?: number
  pause?: number
}

// 台本 = Segment の配列。一息のボイスなら要素1つの配列になる
export type Script = Segment[]

export class ScriptError extends Error {}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

// 不正な構造は ScriptError を投げ、範囲外の数値はクランプして返す。
// LLM の出力を通すことが前提なので、多少の揺れは落とさず矯正する方針
// ({"segments":[...]} で包んできた場合も黙って剥がす)。
export function validateScript(input: unknown): Script {
  const raw = Array.isArray(input)
    ? input
    : (input as { segments?: unknown })?.segments
  if (!Array.isArray(raw)) {
    throw new ScriptError('script must be an array of segments')
  }
  const segments = (raw as Segment[]).map((seg, i) => {
    if (typeof seg !== 'object' || seg === null || typeof seg.text !== 'string' || !seg.text.trim()) {
      throw new ScriptError(`segments[${i}]: "text" must be a non-empty string`)
    }
    const out: Segment = { text: seg.text.trim() }
    if (seg.emotion != null) {
      if (typeof seg.emotion !== 'object') {
        throw new ScriptError(`segments[${i}]: "emotion" must be an object`)
      }
      const emotion: Segment['emotion'] = {}
      for (const [key, value] of Object.entries(seg.emotion)) {
        if (!EMOTIONS.includes(key as Emotion)) continue // 未知の感情軸は黙って捨てる
        if (typeof value !== 'number') continue
        emotion[key as Emotion] = clamp(Math.round(value), 0, 100)
      }
      if (Object.keys(emotion).length > 0) out.emotion = emotion
    }
    if (typeof seg.speed === 'number') out.speed = clamp(Math.round(seg.speed), 50, 200)
    if (typeof seg.pitch === 'number') out.pitch = clamp(Math.round(seg.pitch), -300, 300)
    if (typeof seg.pause === 'number') out.pause = clamp(Math.round(seg.pause), 0, 10_000)
    return out
  })
  if (segments.length === 0) throw new ScriptError('script has no segments')
  return segments
}

// 感情の急変をなじませる。各文の実効パラメータを
//   実効値[i] = (1 - carry) × 自身の値 + carry × 実効値[i-1]
// の指数移動平均にする (感情軸は未指定=0、speed=100 / pitch=0 が基準値)。
// carry=1/3 なら「前の文脈が1/3乗る」。carry=0 で無効。
export function smoothScript(script: Script, carry = 1 / 3): Script {
  if (carry <= 0) return script
  const prev: Record<Emotion, number> = { bosoboso: 0, doyaru: 0, honwaka: 0, angry: 0, teary: 0 }
  let prevSpeed = 100
  let prevPitch = 0

  return script.map((seg, i) => {
    const out: Segment = { text: seg.text }
    // 1文目には「前の文脈」が無いので自身の値をそのまま使う
    const w = i === 0 ? 0 : carry

    const emotion: Segment['emotion'] = {}
    for (const axis of EMOTIONS) {
      const v = (1 - w) * (seg.emotion?.[axis] ?? 0) + w * prev[axis]
      prev[axis] = v
      const rounded = Math.round(v)
      if (rounded > 0) emotion[axis] = rounded
    }
    if (Object.keys(emotion).length > 0) out.emotion = emotion

    prevSpeed = (1 - w) * (seg.speed ?? 100) + w * prevSpeed
    prevPitch = (1 - w) * (seg.pitch ?? 0) + w * prevPitch
    if (Math.round(prevSpeed) !== 100) out.speed = Math.round(prevSpeed)
    if (Math.round(prevPitch) !== 0) out.pitch = Math.round(prevPitch)

    if (seg.pause != null) out.pause = seg.pause
    return out
  })
}

// moca-render に渡す JSONL (1行 = 1 segment)
export function toJsonl(script: Script): string {
  return script.map((seg) => JSON.stringify(seg)).join('\n') + '\n'
}

// LLM の応答から JSON 部分 (配列またはオブジェクト) を取り出す
// (コードフェンスや前置きへの保険)
export function extractJson(text: string): unknown {
  const starts = [text.indexOf('['), text.indexOf('{')].filter((i) => i !== -1)
  const start = starts.length > 0 ? Math.min(...starts) : -1
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  if (start === -1 || end <= start) throw new ScriptError(`no JSON found in: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new ScriptError(`invalid JSON in analyzer output: ${text.slice(0, 200)}`)
  }
}
