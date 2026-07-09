import { describe, expect, test } from 'bun:test'
import { applyDictionary } from './dictionary.js'

describe('applyDictionary', () => {
  test('空辞書は素通し', () => {
    expect(applyDictionary('ハードディスク', [])).toBe('ハードディスク')
  })

  test('最長一致優先 (「ハードディスク」が「ハード」より優先)', () => {
    const entries = [
      { surface: 'ハード', reading: 'はーど' },
      { surface: 'ハードディスク', reading: 'かたいえんばん' },
    ]
    expect(applyDictionary('ハードディスク', entries)).toBe('かたいえんばん')
    // 単独の「ハード」は短い方に一致する
    expect(applyDictionary('ハードだ', entries)).toBe('はーどだ')
  })

  test('ASCII surface は大文字小文字を無視 (Hard=hard=HARD)', () => {
    const entries = [{ surface: 'Hard', reading: 'ハード' }]
    expect(applyDictionary('hard', entries)).toBe('ハード')
    expect(applyDictionary('HARD', entries)).toBe('ハード')
    expect(applyDictionary('Hard', entries)).toBe('ハード')
  })

  test('非ASCII (日本語) surface は完全一致のみ', () => {
    const entries = [{ surface: 'ハード', reading: 'はーど' }]
    // カタカナの別表記には一致しない
    expect(applyDictionary('はーど', entries)).toBe('はーど')
    expect(applyDictionary('ハード', entries)).toBe('はーど')
  })

  test('置換後テキストは再走査しない (カスケード防止)', () => {
    const entries = [
      { surface: 'A', reading: 'B' },
      { surface: 'B', reading: 'C' },
    ]
    // A→B に置換した B は再走査されないので C にはならない
    expect(applyDictionary('A', entries)).toBe('B')
    expect(applyDictionary('AB', entries)).toBe('BC')
  })

  test('一致箇所のみ置換し前後はそのまま', () => {
    const entries = [{ surface: 'GPU', reading: 'ジーピーユー' }]
    expect(applyDictionary('このGPUは速い', entries)).toBe('このジーピーユーは速い')
  })
})
