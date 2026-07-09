mod config;
mod db;
mod error;
mod routes;
mod state;

use config::Config;
use state::AppState;
use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt::init();

    let config = Config::from_env();
    let conn = db::open(&config.db_path);

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        config: config.clone(),
    };

    let app = routes::build_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind");
    tracing::info!("moca-server running on http://localhost:{}/", config.port);
    axum::serve(listener, app).await.expect("Server error");
}
