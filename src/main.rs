mod analyze;
mod config;
mod db;
mod dictionary;
mod error;
mod opus;
mod routes;
mod script;
mod serialize;
mod spa;
mod state;
mod synth;
mod wav;

use config::Config;
use state::AppState;
use std::sync::{Arc, Mutex};
use synth::SynthQueue;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt::init();

    let config = Config::from_env();
    let conn = db::open(&config.db_path);
    let analyzer = analyze::create_analyzer_from_env();
    // 通知 broadcast。購読者ゼロでも send は Err になるだけで捨てられる (fire-and-forget)。
    let (notify, _) = tokio::sync::broadcast::channel::<String>(64);

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        config: config.clone(),
        synth: Arc::new(SynthQueue::new()),
        analyzer: Arc::new(analyzer),
        notify,
        vp_fingerprint: Arc::new(tokio::sync::OnceCell::new()),
    };

    let app = routes::build_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind");
    tracing::info!("moca-server running on http://localhost:{}/", config.port);
    axum::serve(listener, app).await.expect("Server error");
}
