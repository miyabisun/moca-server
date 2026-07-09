// 読み替え辞書の適用ロジック。合成時の入力前処理としてのみ使う。
// マスターテキスト (lines.text / script JSON) は決して書き換えない — 音だけ差し替える。
import { db } from './db/index.js'
import { dictionary } from './db/schema.js'

export interface DictEntry {
  surface: string
  reading: string
}

// 全ASCII なら大文字小文字を無視して比較したいので、判定を一度で済ませる
const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s)

// db から全件取得 (合成1リクエストにつき1回ロードする想定)
export function loadDictionary(): DictEntry[] {
  return db.select({ surface: dictionary.surface, reading: dictionary.reading }).from(dictionary).all()
}

// text を左→右に1パス走査し、各位置で surface 最長一致優先で置換する。
// surface が全ASCII なら大文字小文字を無視、非ASCII (日本語含む) は完全一致。
// 一致したら reading を出力して surface 長ぶん前進する (置換後テキストは再走査しない
// = カスケード防止)。不一致なら1文字送る。空辞書は素通し。
export function applyDictionary(text: string, entries: DictEntry[]): string {
  if (entries.length === 0) return text
  // 最長一致優先で surface 長さ降順に並べ、ASCII判定と小文字化を各語句1回だけ前計算する。
  // needle は照合対象: ASCII なら小文字化した lower と、非ASCII なら原文と比較する。
  const rules = entries
    .filter((e) => e.surface.length > 0)
    .sort((a, b) => b.surface.length - a.surface.length)
    .map((e) => {
      const ascii = isAscii(e.surface)
      return { reading: e.reading, len: e.surface.length, ascii, needle: ascii ? e.surface.toLowerCase() : e.surface }
    })
  const lower = text.toLowerCase()

  let out = ''
  let i = 0
  while (i < text.length) {
    const hit = rules.find(
      (r) => (r.ascii ? lower : text).slice(i, i + r.len) === r.needle,
    )
    if (hit) {
      out += hit.reading
      i += hit.len
    } else {
      out += text[i]
      i += 1
    }
  }
  return out
}
