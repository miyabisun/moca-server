// 通知 pub/sub。tmux などの外部イベントを text/plain で受け、購読中の全 SPA に
// SSE で broadcast する。永続化・再送・認証はしない (LAN 前提の fire-and-forget)。
// 契約は src-ts/routes/notify.test.ts が正。

use crate::error::AppError;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use std::convert::Infallible;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/notify", post(notify))
        .route("/notify/stream", get(stream))
}

/// POST /notify: text/plain を受け、空 (trim) なら 400、それ以外は全購読者へ broadcast して 204。
async fn notify(State(state): State<AppState>, body: Bytes) -> Result<Response, AppError> {
    let text = String::from_utf8_lossy(&body);
    if text.trim().is_empty() {
        return Err(AppError::BadRequest("text required".into()));
    }
    // 購読者ゼロなら send は Err になるが無視する (fire-and-forget)。
    let _ = state.notify.send(text.into_owned());
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// GET /notify/stream: broadcast を購読し data のみの SSE で流す。
/// SPA は es.onmessage (無名イベント) を購読するので event 名は付けない。
/// 切断で rx が drop され自動クリーンアップされる。
async fn stream(State(state): State<AppState>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.notify.subscribe();
    // Lagged (取りこぼし) は skip し、受信テキストを data 行にする。
    let stream = BroadcastStream::new(rx).filter_map(|msg| match msg {
        Ok(text) => Some(Ok(Event::default().data(text))),
        Err(_) => None,
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
