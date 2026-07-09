use std::env;

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub db_path: String,
}

impl Config {
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        // TS 版と同じ既定: リポジトリ直下の moca.db (相対パスは起動ディレクトリ基準)
        let db_path = env::var("DATABASE_PATH").unwrap_or_else(|_| "./moca.db".to_string());

        Self { port, db_path }
    }
}
