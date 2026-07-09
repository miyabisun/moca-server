// テキスト → 台本JSON (感情パラメータの自動生成)。TS 版 app.ts の /analyze を移植。
// ?carry=0〜0.9 で前の文の感情をどれだけ引きずるか指定 (既定 1/3、0 で無効)。
// 辞書は適用しない (原文を analyzer に渡す) — TS 版の不変条件。

use crate::analyze::DEFAULT_CARRY;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use axum::routing::post;
use axum::Router;
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new().route("/analyze", post(analyze))
}

async fn analyze(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
    body: Bytes,
) -> Response {
    let text = String::from_utf8_lossy(&body);
    if text.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "text required").into_response();
    }

    // carry 未指定は既定 1/3。指定は数値かつ 0〜0.9 の範囲内でなければ 400。
    let carry = match query.get("carry") {
        None => DEFAULT_CARRY,
        Some(raw) => match raw.parse::<f64>() {
            Ok(n) if (0.0..=0.9).contains(&n) => n,
            _ => {
                return (
                    StatusCode::BAD_REQUEST,
                    "carry must be a number between 0 and 0.9",
                )
                    .into_response()
            }
        },
    };

    match state.analyzer.analyze(&text, carry).await {
        Ok(script) => Json(script).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e.0).into_response(),
    }
}
