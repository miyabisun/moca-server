// 台本 (script) JSON のスキーマ検証。TS 版 src-ts/script.ts の validateScript 相当。
// smoothScript / extractJson / toJsonl は R3 で移植する (今回は未使用のため入れない)。

use crate::error::AppError;
use serde_json::{Map, Value};

pub const EMOTIONS: [&str; 5] = ["bosoboso", "doyaru", "honwaka", "angry", "teary"];

/// 台本検証エラー。AppError::BadRequest にマップされる (TS の ScriptError 相当)。
#[derive(Debug)]
pub struct ScriptError(pub String);

impl From<ScriptError> for AppError {
    fn from(e: ScriptError) -> Self {
        AppError::BadRequest(e.0)
    }
}

fn clamp(n: f64, min: f64, max: f64) -> f64 {
    n.max(min).min(max)
}

// JS の Math.round (0.5 は +∞ 方向に丸める) を再現する。
fn js_round(n: f64) -> f64 {
    (n + 0.5).floor()
}

fn clamped_int(n: f64, min: f64, max: f64) -> Value {
    Value::from(clamp(js_round(n), min, max) as i64)
}

// 不正な構造は ScriptError を返し、範囲外の数値はクランプする。
// ({"segments":[...]} で包んできた場合も黙って剥がす。)
pub fn validate_script(input: &Value) -> Result<Value, ScriptError> {
    let raw = if let Some(arr) = input.as_array() {
        arr
    } else if let Some(arr) = input.get("segments").and_then(Value::as_array) {
        arr
    } else {
        return Err(ScriptError("script must be an array of segments".into()));
    };

    let mut segments: Vec<Value> = Vec::with_capacity(raw.len());
    for (i, seg) in raw.iter().enumerate() {
        let text = seg
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|t| !t.is_empty());
        let text = match text {
            Some(t) => t,
            None => {
                return Err(ScriptError(format!(
                    "segments[{i}]: \"text\" must be a non-empty string"
                )))
            }
        };

        let mut out = Map::new();
        out.insert("text".into(), Value::from(text));

        if let Some(emotion) = seg.get("emotion") {
            if !emotion.is_null() {
                let obj = emotion.as_object().ok_or_else(|| {
                    ScriptError(format!("segments[{i}]: \"emotion\" must be an object"))
                })?;
                let mut emo = Map::new();
                for (key, value) in obj {
                    if !EMOTIONS.contains(&key.as_str()) {
                        continue; // 未知の感情軸は黙って捨てる
                    }
                    if let Some(n) = value.as_f64() {
                        emo.insert(key.clone(), clamped_int(n, 0.0, 100.0));
                    }
                }
                if !emo.is_empty() {
                    out.insert("emotion".into(), Value::Object(emo));
                }
            }
        }

        if let Some(n) = seg.get("speed").and_then(Value::as_f64) {
            out.insert("speed".into(), clamped_int(n, 50.0, 200.0));
        }
        if let Some(n) = seg.get("pitch").and_then(Value::as_f64) {
            out.insert("pitch".into(), clamped_int(n, -300.0, 300.0));
        }
        if let Some(n) = seg.get("pause").and_then(Value::as_f64) {
            out.insert("pause".into(), clamped_int(n, 0.0, 10_000.0));
        }

        segments.push(Value::Object(out));
    }

    if segments.is_empty() {
        return Err(ScriptError("script has no segments".into()));
    }
    Ok(Value::Array(segments))
}

// script (配列) を検証して保存用文字列にする。不正なら ScriptError を返す。
pub fn serialize_script(input: &Value) -> Result<String, ScriptError> {
    let script = validate_script(input)?;
    Ok(script.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn valid_script_passes_through() {
        let out = validate_script(&json!([
            { "text": "こんにちは。", "emotion": { "honwaka": 60 }, "speed": 110, "pause": 300 }
        ]))
        .unwrap();
        assert_eq!(
            out,
            json!([{ "text": "こんにちは。", "emotion": { "honwaka": 60 }, "speed": 110, "pause": 300 }])
        );
    }

    #[test]
    fn unwraps_segments_wrapper() {
        let out = validate_script(&json!({ "segments": [{ "text": "a" }] })).unwrap();
        assert_eq!(out, json!([{ "text": "a" }]));
    }

    #[test]
    fn clamps_out_of_range_numbers() {
        let out = validate_script(&json!([
            { "text": "a", "emotion": { "angry": 150 }, "speed": 10, "pitch": 999, "pause": -5 }
        ]))
        .unwrap();
        assert_eq!(
            out,
            json!([{ "text": "a", "emotion": { "angry": 100 }, "speed": 50, "pitch": 300, "pause": 0 }])
        );
    }

    #[test]
    fn drops_unknown_emotion_axes() {
        let out = validate_script(&json!([{ "text": "a", "emotion": { "happy": 50, "doyaru": 30 } }]))
            .unwrap();
        assert_eq!(out[0]["emotion"], json!({ "doyaru": 30 }));
    }

    #[test]
    fn rejects_invalid_scripts() {
        assert!(validate_script(&json!({})).is_err());
        assert!(validate_script(&json!("text")).is_err());
        assert!(validate_script(&json!([])).is_err());
        assert!(validate_script(&json!([{ "emotion": { "angry": 1 } }])).is_err());
        assert!(validate_script(&json!([{ "text": "  " }])).is_err());
    }
}
