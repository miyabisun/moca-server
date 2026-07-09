// 読み替え辞書の適用ロジック。合成時の入力前処理としてのみ使う。
// マスターテキスト (lines.text / script JSON) は決して書き換えない — 音だけ差し替える。
// 置換規則: 表記→読み。最長一致優先で、ASCII の surface は大文字小文字を無視する。

use rusqlite::Connection;
use serde_json::{Map, Value};

#[derive(Debug, Clone)]
pub struct DictEntry {
    pub surface: String,
    pub reading: String,
}

// db から全件取得 (合成 1 リクエストにつき 1 回ロードする想定)。
pub fn load_dictionary(conn: &Connection) -> rusqlite::Result<Vec<DictEntry>> {
    let mut stmt = conn.prepare("SELECT surface, reading FROM dictionary")?;
    let rows = stmt.query_map([], |r| {
        Ok(DictEntry {
            surface: r.get(0)?,
            reading: r.get(1)?,
        })
    })?;
    rows.collect()
}

struct Rule {
    reading: String,
    // char 単位の照合キー。ASCII surface は小文字化して大小無視、非ASCII は原文で完全一致。
    needle: Vec<char>,
    ascii: bool,
}

// text を左→右に1パス走査し、各位置で surface 最長一致優先で置換する。
// surface が全ASCII なら大文字小文字を無視、非ASCII (日本語含む) は完全一致。
// 一致したら reading を出力して surface 長ぶん前進する (カスケード防止)。空辞書は素通し。
pub fn apply_dictionary(text: &str, entries: &[DictEntry]) -> String {
    if entries.is_empty() {
        return text.to_string();
    }

    let mut rules: Vec<Rule> = entries
        .iter()
        .filter(|e| !e.surface.is_empty())
        .map(|e| {
            let ascii = e.surface.is_ascii();
            let needle: Vec<char> = if ascii {
                e.surface.chars().map(|c| c.to_ascii_lowercase()).collect()
            } else {
                e.surface.chars().collect()
            };
            Rule {
                reading: e.reading.clone(),
                needle,
                ascii,
            }
        })
        .collect();
    // 最長一致優先で surface 長さ (char 数) 降順に並べる。
    rules.sort_by(|a, b| b.needle.len().cmp(&a.needle.len()));

    let chars: Vec<char> = text.chars().collect();
    // ASCII 照合用に大小無視した並列配列 (非ASCII は原文のまま = 位置ずれしない)。
    let lower: Vec<char> = chars.iter().map(|c| c.to_ascii_lowercase()).collect();

    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let hit = rules.iter().find(|r| {
            let end = i + r.needle.len();
            if end > chars.len() {
                return false;
            }
            let hay = if r.ascii { &lower[i..end] } else { &chars[i..end] };
            hay == r.needle.as_slice()
        });
        if let Some(r) = hit {
            out.push_str(&r.reading);
            i += r.needle.len();
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// script セグメント配列の各要素の "text" に f を適用する。
/// text 以外のフィールド (emotion / pause 等) はそのまま保持する。
pub fn map_segment_text(segments: &[Value], mut f: impl FnMut(&str) -> String) -> Vec<Value> {
    segments
        .iter()
        .map(|seg| {
            let mut obj: Map<String, Value> = seg.as_object().cloned().unwrap_or_default();
            if let Some(text) = obj.get("text").and_then(Value::as_str) {
                obj.insert("text".into(), Value::from(f(text)));
            }
            Value::Object(obj)
        })
        .collect()
}

/// script セグメント配列の各要素の "text" に辞書を適用する。
pub fn apply_dictionary_to_segments(segments: &[Value], entries: &[DictEntry]) -> Vec<Value> {
    map_segment_text(segments, |text| apply_dictionary(text, entries))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use rusqlite::Connection;

    fn entry(surface: &str, reading: &str) -> DictEntry {
        DictEntry {
            surface: surface.into(),
            reading: reading.into(),
        }
    }

    #[test]
    fn empty_dictionary_passes_through() {
        assert_eq!(apply_dictionary("ハードディスク", &[]), "ハードディスク");
    }

    #[test]
    fn longest_match_wins() {
        let entries = vec![
            entry("ハード", "はーど"),
            entry("ハードディスク", "かたいえんばん"),
        ];
        assert_eq!(apply_dictionary("ハードディスク", &entries), "かたいえんばん");
        assert_eq!(apply_dictionary("ハードだ", &entries), "はーどだ");
    }

    #[test]
    fn ascii_surface_is_case_insensitive() {
        let entries = vec![entry("Hard", "ハード")];
        assert_eq!(apply_dictionary("hard", &entries), "ハード");
        assert_eq!(apply_dictionary("HARD", &entries), "ハード");
        assert_eq!(apply_dictionary("Hard", &entries), "ハード");
    }

    #[test]
    fn non_ascii_surface_is_exact_match() {
        let entries = vec![entry("ハード", "はーど")];
        assert_eq!(apply_dictionary("はーど", &entries), "はーど");
        assert_eq!(apply_dictionary("ハード", &entries), "はーど");
    }

    #[test]
    fn no_cascade_rescan() {
        let entries = vec![entry("A", "B"), entry("B", "C")];
        assert_eq!(apply_dictionary("A", &entries), "B");
        assert_eq!(apply_dictionary("AB", &entries), "BC");
    }

    #[test]
    fn replaces_only_matched_span() {
        let entries = vec![entry("GPU", "ジーピーユー")];
        assert_eq!(
            apply_dictionary("このGPUは速い", &entries),
            "このジーピーユーは速い"
        );
    }

    #[test]
    fn load_dictionary_reads_all_rows() {
        let conn = Connection::open_in_memory().unwrap();
        db::init(&conn);
        conn.execute(
            "INSERT INTO dictionary (surface, reading, created_at) VALUES ('GPU', 'ジーピーユー', 'now')",
            [],
        )
        .unwrap();
        let entries = load_dictionary(&conn).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].surface, "GPU");
        assert_eq!(apply_dictionary("GPU", &entries), "ジーピーユー");
    }
}
