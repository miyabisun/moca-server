import { describe, expect, test } from 'bun:test'
import { ScriptError, extractJson, smoothScript, toJsonl, validateScript } from './script.js'

describe('validateScript', () => {
  test('正常な台本 (配列) はそのまま通る', () => {
    const script = validateScript([
      { text: 'こんにちは。', emotion: { honwaka: 60 }, speed: 110, pause: 300 },
    ])
    expect(script[0]).toEqual({
      text: 'こんにちは。',
      emotion: { honwaka: 60 },
      speed: 110,
      pause: 300,
    })
  })

  test('{"segments":[...]} で包まれていても剥がして通す', () => {
    const script = validateScript({ segments: [{ text: 'a' }] })
    expect(script).toEqual([{ text: 'a' }])
  })

  test('範囲外の数値はクランプされる', () => {
    const script = validateScript([
      { text: 'a', emotion: { angry: 150 }, speed: 10, pitch: 999, pause: -5 },
    ])
    expect(script[0]).toEqual({
      text: 'a',
      emotion: { angry: 100 },
      speed: 50,
      pitch: 300,
      pause: 0,
    })
  })

  test('未知の感情軸は黙って捨てる', () => {
    const script = validateScript([{ text: 'a', emotion: { happy: 50, doyaru: 30 } }])
    expect(script[0].emotion).toEqual({ doyaru: 30 })
  })

  test('配列でない・空・text 欠落は ScriptError', () => {
    expect(() => validateScript({})).toThrow(ScriptError)
    expect(() => validateScript('text')).toThrow(ScriptError)
    expect(() => validateScript([])).toThrow(ScriptError)
    expect(() => validateScript([{ emotion: { angry: 1 } }])).toThrow(ScriptError)
    expect(() => validateScript([{ text: '  ' }])).toThrow(ScriptError)
  })
})

describe('smoothScript', () => {
  test('前の文の感情が 1/3 ずつ減衰しながら乗る', () => {
    const script = smoothScript([{ text: 'a', emotion: { angry: 90 } }, { text: 'b' }, { text: 'c' }])
    expect(script[0].emotion).toEqual({ angry: 90 }) // 1文目はそのまま
    expect(script[1].emotion).toEqual({ angry: 30 }) // 90 × 1/3
    expect(script[2].emotion).toEqual({ angry: 10 }) // 30 × 1/3
  })

  test('感情の急変が緩和される (bosoboso → honwaka)', () => {
    const script = smoothScript([
      { text: '疲れた……。', emotion: { bosoboso: 70 }, speed: 85 },
      { text: '明日は休みます。', emotion: { honwaka: 75 } },
    ])
    // 2文目: honwaka 75×2/3=50 に前の bosoboso 70×1/3≈23 が残り、speed も 85 を引きずる
    expect(script[1].emotion).toEqual({ honwaka: 50, bosoboso: 23 })
    expect(script[1].speed).toBe(95) // 100×2/3 + 85×1/3
  })

  test('同じ感情が続く場合はほぼ維持される', () => {
    const script = smoothScript([
      { text: 'a', emotion: { angry: 90 } },
      { text: 'b', emotion: { angry: 90 } },
    ])
    expect(script[1].emotion).toEqual({ angry: 90 })
  })

  test('carry=0 は無変換', () => {
    const input = [{ text: 'a', emotion: { angry: 90 } }, { text: 'b' }]
    expect(smoothScript(input, 0)).toEqual(input)
  })

  test('pause はなじませ対象外', () => {
    const script = smoothScript([{ text: 'a', pause: 300 }, { text: 'b' }])
    expect(script[0].pause).toBe(300)
    expect(script[1].pause).toBeUndefined()
  })
})

describe('toJsonl', () => {
  test('1行 = 1 segment の JSONL になる', () => {
    const jsonl = toJsonl([{ text: 'a' }, { text: 'b', pause: 100 }])
    expect(jsonl).toBe('{"text":"a"}\n{"text":"b","pause":100}\n')
  })
})

describe('extractJson', () => {
  test('コードフェンスや前置きがあっても JSON 配列を取り出す', () => {
    const out = extractJson('台本です:\n```json\n[{"text":"a"}]\n```')
    expect(out).toEqual([{ text: 'a' }])
  })

  test('オブジェクト形式でも取り出せる', () => {
    const out = extractJson('{"segments":[{"text":"a"}]}')
    expect(out).toEqual({ segments: [{ text: 'a' }] })
  })

  test('JSON が無ければ ScriptError', () => {
    expect(() => extractJson('ごめんなさい、できません')).toThrow(ScriptError)
  })
})
