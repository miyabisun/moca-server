// 読み替え辞書 CRUD。surface (表記) をキーに upsert し、reading (読み) を返す。

use crate::db::now_iso;
use crate::error::AppError;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{delete, get};
use axum::{Json, Router};
use rusqlite::OptionalExtension;
use serde_json::{json, Value};

use super::{parse_body, parse_id, JsonResult};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/dictionary", get(list).post(upsert))
        .route("/api/dictionary/{id}", delete(remove))
}

fn entry_value(id: i64, surface: String, reading: String, created_at: String) -> Value {
    json!({ "id": id, "surface": surface, "reading": reading, "created_at": created_at })
}

// 全件 (表記昇順の安定順)
async fn list(State(state): State<AppState>) -> JsonResult {
    let conn = state.db.lock().unwrap();
    let mut stmt =
        conn.prepare("SELECT id, surface, reading, created_at FROM dictionary ORDER BY surface")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(entry_value(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok((StatusCode::OK, Json(Value::Array(rows))))
}

// 追加 / 更新。surface が既存なら reading を上書き (upsert)。insert/update どちらも 201。
async fn upsert(State(state): State<AppState>, body: Bytes) -> JsonResult {
    let body = parse_body(&body);
    let surface = body
        .get("surface")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    let reading = body
        .get("reading")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if surface.is_empty() {
        return Err(AppError::BadRequest("surface required".into()));
    }
    if reading.is_empty() {
        return Err(AppError::BadRequest("reading required".into()));
    }

    let conn = state.db.lock().unwrap();
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM dictionary WHERE surface = ?1",
            [surface],
            |r| r.get(0),
        )
        .optional()?;

    let row = match existing {
        Some(existing_id) => conn.query_row(
            "UPDATE dictionary SET reading = ?1 WHERE id = ?2 \
             RETURNING id, surface, reading, created_at",
            (reading, existing_id),
            |r| Ok(entry_value(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?,
        None => conn.query_row(
            "INSERT INTO dictionary (surface, reading, created_at) VALUES (?1, ?2, ?3) \
             RETURNING id, surface, reading, created_at",
            (surface, reading, now_iso()),
            |r| Ok(entry_value(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?,
    };
    Ok((StatusCode::CREATED, Json(row)))
}

// 削除
async fn remove(State(state): State<AppState>, Path(id): Path<String>) -> JsonResult {
    let id = parse_id(&id)?;
    let conn = state.db.lock().unwrap();
    let exists: Option<i64> = conn
        .query_row("SELECT id FROM dictionary WHERE id = ?1", [id], |r| r.get(0))
        .optional()?;
    if exists.is_none() {
        return Err(AppError::NotFound("not found".into()));
    }
    conn.execute("DELETE FROM dictionary WHERE id = ?1", [id])?;
    Ok((StatusCode::OK, Json(json!({ "ok": true }))))
}
