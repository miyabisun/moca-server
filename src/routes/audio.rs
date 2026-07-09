// 動画パイプ向けの合成 API。
//   GET /api/projects/{id}/lines/{lineId}/audio.wav — 保存済みの行を合成し WAV で返す
//     (動画素材は可逆が正なので Accept 不問で常に WAV)。
//   GET /api/fingerprint — 合成環境のハッシュ (voicepeak / narrator / 辞書 / server) を返す。

use crate::dictionary::{apply_dictionary, apply_dictionary_to_segments, load_dictionary, DictEntry};
use crate::error::AppError;
use crate::serialize::get_line;
use crate::state::AppState;
use crate::synth::{split_sentences, OutputFormat};
use axum::extract::{Path, State};
use axum::response::Response;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/projects/{id}/lines/{lineId}/audio.wav",
            get(audio_wav),
        )
        .route("/api/fingerprint", get(fingerprint))
}

/// 保存済みの行を合成し WAV でチャンク配信する。
async fn audio_wav(
    State(state): State<AppState>,
    Path((id, line_id)): Path<(String, String)>,
) -> Result<Response, AppError> {
    let project_id = super::parse_id(&id)?;
    let line_id = super::parse_id(&line_id)?;

    // DB ロック内で行と辞書を取り切ってからロックを手放す (.await 前に drop する)。
    let (mode, text, script, entries) = {
        let conn = state.db.lock().unwrap();
        let row = get_line(&conn, line_id)?;
        let row = match row {
            Some(r) if r.project_id == project_id => r,
            _ => return Err(AppError::NotFound("line not found".into())),
        };
        let entries = load_dictionary(&conn)?;
        (row.mode, row.text, row.script, entries)
    };

    // acting かつ script が保存されていれば台本経路、それ以外は text を文分割する経路。
    // acting だが script が NULL の場合も 404/500 にせず text 経路に落とす (データを失わない)。
    let segments = match script {
        Some(s) if mode == "acting" => stored_script_segments(&s, &entries)?,
        _ => split_sentences(&apply_dictionary(&text, &entries))
            .into_iter()
            .map(|s| json!({ "text": s }))
            .collect(),
    };

    // 動画素材は可逆が正なので Accept 不問で常に WAV。say の WAV 経路をそのまま通す。
    Ok(super::say::stream_response(&state, segments, OutputFormat::Wav))
}

/// 保存済み script 文字列 (保存時に検証済み) を parse し、各 segment.text に辞書を適用する。
fn stored_script_segments(script: &str, entries: &[DictEntry]) -> Result<Vec<Value>, AppError> {
    let parsed: Value = serde_json::from_str(script)
        .map_err(|e| AppError::Internal(format!("stored script parse: {e}")))?;
    let arr = parsed
        .as_array()
        .ok_or_else(|| AppError::Internal("stored script is not an array".into()))?;
    Ok(apply_dictionary_to_segments(arr, entries))
}

/// sha256 ダイジェストの先頭 `bytes` バイトを 16 進文字列で返す。
fn sha256_prefix(data: &[u8], bytes: usize) -> String {
    let digest = Sha256::digest(data);
    let mut s = String::with_capacity(bytes * 2);
    for b in digest.iter().take(bytes) {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// 合成環境のハッシュを返す。voicepeak バイナリ・ナレーター・辞書・サーバー版を素材にする。
async fn fingerprint(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    // voicepeak バイナリの sha256 (先頭16hex)。読み取りのみ (起動しない)。初回だけ計算しキャッシュ。
    let voicepeak = state
        .vp_fingerprint
        .get_or_init(|| {
            let path = state.config.voicepeak_path.clone();
            async move {
                match tokio::fs::read(&path).await {
                    Ok(bytes) => sha256_prefix(&bytes, 8),
                    Err(_) => "unavailable".to_string(),
                }
            }
        })
        .await
        .clone();

    // 辞書: surface/reading を id 順に決定的セパレータで連結して sha256 (先頭16hex)。
    let dict_material = {
        let conn = state.db.lock().unwrap();
        let mut stmt = conn.prepare("SELECT surface, reading FROM dictionary ORDER BY id")?;
        let rows = stmt.query_map([], |r| {
            let surface: String = r.get(0)?;
            let reading: String = r.get(1)?;
            Ok(format!("{surface}\u{1f}{reading}"))
        })?;
        let lines: Vec<String> = rows.collect::<rusqlite::Result<_>>()?;
        lines.join("\u{1e}")
    };
    let dictionary = sha256_prefix(dict_material.as_bytes(), 8);

    let narrator = state.config.narrator.clone();
    let server = env!("CARGO_PKG_VERSION").to_string();

    // fingerprint 本体: components を安定順序で連結した文字列の sha256 (full 64hex)。
    let combined = format!("{voicepeak}{narrator}{dictionary}{server}");
    let fingerprint = sha256_prefix(combined.as_bytes(), 32);

    Ok(Json(json!({
        "fingerprint": fingerprint,
        "components": {
            "voicepeak": voicepeak,
            "narrator": narrator,
            "dictionary": dictionary,
            "server": server,
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::synth::SynthQueue;
    use crate::wav::{wav_header, MOCA_FORMAT};
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use rusqlite::Connection;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use tower::ServiceExt;

    const PCM_LEN: usize = 200;

    fn fixture_wav() -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&((36 + PCM_LEN) as u32).to_le_bytes());
        b.extend_from_slice(b"WAVE");
        b.extend_from_slice(b"fmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&48000u32.to_le_bytes());
        b.extend_from_slice(&96000u32.to_le_bytes());
        b.extend_from_slice(&2u16.to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&(PCM_LEN as u32).to_le_bytes());
        b.extend_from_slice(&[7u8; PCM_LEN]);
        b
    }

    struct Fake {
        _dir: TempDir,
        bin: PathBuf,
        record: PathBuf,
    }

    // -o のパスへ固定 WAV を書き、-s のテキストを記録するフェイク voicepeak。
    fn make_fake() -> Fake {
        let dir = tempfile::tempdir().unwrap();
        let fixture = dir.path().join("fixture.wav");
        std::fs::write(&fixture, fixture_wav()).unwrap();
        let record = dir.path().join("record.txt");
        let bin = dir.path().join("fake-voicepeak");
        let script = format!(
            "#!/usr/bin/env bash\n\
             out=\"\"\n\
             text=\"\"\n\
             while [ $# -gt 0 ]; do\n\
             \x20 case \"$1\" in\n\
             \x20   -o) out=\"$2\"; shift 2;;\n\
             \x20   -s) text=\"$2\"; shift 2;;\n\
             \x20   *) shift;;\n\
             \x20 esac\n\
             done\n\
             printf '%s\\n' \"$text\" >> \"{record}\"\n\
             cp \"{fixture}\" \"$out\"\n",
            record = record.display(),
            fixture = fixture.display(),
        );
        std::fs::write(&bin, script).unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        Fake {
            _dir: dir,
            bin,
            record,
        }
    }

    fn state_with(voicepeak_path: String) -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init(&conn);
        let (notify, _) = tokio::sync::broadcast::channel::<String>(16);
        AppState {
            db: Arc::new(Mutex::new(conn)),
            config: Config {
                port: 0,
                db_path: ":memory:".into(),
                voicepeak_path,
                narrator: "Test".into(),
            },
            synth: Arc::new(SynthQueue::new()),
            analyzer: Arc::new(crate::analyze::Backend::None),
            notify,
            vp_fingerprint: Arc::new(tokio::sync::OnceCell::new()),
        }
    }

    fn insert_project(state: &AppState, name: &str) -> i64 {
        let conn = state.db.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (name, created_at, updated_at) VALUES (?1, 'now', 'now')",
            [name],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_line(
        state: &AppState,
        project_id: i64,
        mode: &str,
        text: &str,
        script: Option<&str>,
    ) -> i64 {
        let conn = state.db.lock().unwrap();
        conn.execute(
            "INSERT INTO lines (project_id, position, mode, text, script) VALUES (?1, 0, ?2, ?3, ?4)",
            rusqlite::params![project_id, mode, text, script],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_dict(state: &AppState, surface: &str, reading: &str) {
        let conn = state.db.lock().unwrap();
        conn.execute(
            "INSERT INTO dictionary (surface, reading, created_at) VALUES (?1, ?2, 'now')",
            [surface, reading],
        )
        .unwrap();
    }

    async fn send(app: &Router, uri: &str) -> (StatusCode, Vec<u8>) {
        let req = Request::builder()
            .uri(uri)
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (status, bytes.to_vec())
    }

    async fn json_body(app: &Router, uri: &str) -> Value {
        let (_, bytes) = send(app, uri).await;
        serde_json::from_slice(&bytes).unwrap()
    }

    fn riff_prefix() -> Vec<u8> {
        wav_header(&MOCA_FORMAT)
    }

    #[tokio::test]
    async fn audio_wav_announcer_returns_riff() {
        let fake = make_fake();
        let state = state_with(fake.bin.display().to_string());
        let pid = insert_project(&state, "P");
        let lid = insert_line(&state, pid, "announcer", "こんにちは。", None);
        let app = routes().with_state(state);
        let (status, body) = send(&app, &format!("/api/projects/{pid}/lines/{lid}/audio.wav")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.starts_with(&riff_prefix()));
    }

    #[tokio::test]
    async fn audio_wav_acting_with_script_returns_riff() {
        let fake = make_fake();
        let state = state_with(fake.bin.display().to_string());
        insert_dict(&state, "GPU", "ジーピーユー");
        let pid = insert_project(&state, "P");
        let script = r#"[{"text":"このGPU。","emotion":{"honwaka":60}}]"#;
        let lid = insert_line(&state, pid, "acting", "無視される", Some(script));
        let app = routes().with_state(state);
        let (status, body) = send(&app, &format!("/api/projects/{pid}/lines/{lid}/audio.wav")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.starts_with(&riff_prefix()));
        // 辞書が script の text に適用されている。
        let recorded = std::fs::read_to_string(&fake.record).unwrap();
        assert!(recorded.contains("このジーピーユー。"), "recorded: {recorded}");
    }

    #[tokio::test]
    async fn audio_wav_acting_null_script_falls_back_to_text() {
        let fake = make_fake();
        let state = state_with(fake.bin.display().to_string());
        let pid = insert_project(&state, "P");
        // acting だが script は NULL → text 文分割経路に落ちる (404/500 にしない)。
        let lid = insert_line(&state, pid, "acting", "一。二。", None);
        let app = routes().with_state(state);
        let (status, body) = send(&app, &format!("/api/projects/{pid}/lines/{lid}/audio.wav")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.starts_with(&riff_prefix()));
        let recorded = std::fs::read_to_string(&fake.record).unwrap();
        // 2 文に分割されて 2 回合成される。
        assert!(recorded.contains("一。"), "recorded: {recorded}");
        assert!(recorded.contains("二。"), "recorded: {recorded}");
    }

    #[tokio::test]
    async fn audio_wav_missing_line_is_404() {
        let fake = make_fake();
        let state = state_with(fake.bin.display().to_string());
        let pid = insert_project(&state, "P");
        let app = routes().with_state(state);
        let (status, _) = send(&app, &format!("/api/projects/{pid}/lines/9999/audio.wav")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn audio_wav_foreign_project_is_404() {
        let fake = make_fake();
        let state = state_with(fake.bin.display().to_string());
        let p1 = insert_project(&state, "P1");
        let p2 = insert_project(&state, "P2");
        let lid = insert_line(&state, p1, "announcer", "あ。", None);
        let app = routes().with_state(state);
        // p2 に属さない lid を p2 経由で要求 → 404。
        let (status, _) = send(&app, &format!("/api/projects/{p2}/lines/{lid}/audio.wav")).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn audio_wav_invalid_id_is_400() {
        let fake = make_fake();
        let state = state_with(fake.bin.display().to_string());
        let app = routes().with_state(state);
        let (status, _) = send(&app, "/api/projects/abc/lines/1/audio.wav").await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn fingerprint_is_stable_and_unavailable_when_binary_missing() {
        // 不在パス → voicepeak component は "unavailable"、200 で返る。
        let state = state_with("/nonexistent/voicepeak".into());
        let app = routes().with_state(state);
        let a = json_body(&app, "/api/fingerprint").await;
        let b = json_body(&app, "/api/fingerprint").await;
        assert_eq!(a, b); // 安定性
        assert_eq!(a["components"]["voicepeak"], "unavailable");
        assert_eq!(a["fingerprint"].as_str().unwrap().len(), 64);
    }

    #[tokio::test]
    async fn fingerprint_changes_when_dictionary_changes() {
        let state = state_with("/nonexistent/voicepeak".into());
        let dict_before;
        let fp_before;
        {
            let app = routes().with_state(state.clone());
            let v = json_body(&app, "/api/fingerprint").await;
            dict_before = v["components"]["dictionary"].as_str().unwrap().to_string();
            fp_before = v["fingerprint"].as_str().unwrap().to_string();
        }
        insert_dict(&state, "GPU", "ジーピーユー");
        let app = routes().with_state(state);
        let v = json_body(&app, "/api/fingerprint").await;
        assert_ne!(v["components"]["dictionary"].as_str().unwrap(), dict_before);
        assert_ne!(v["fingerprint"].as_str().unwrap(), fp_before);
    }
}
