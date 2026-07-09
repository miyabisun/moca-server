use std::env;

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub db_path: String,
    /// voicepeak CLI の実行パス (env: VOICEPEAK)。合成時に直接起動する。
    pub voicepeak_path: String,
    /// 合成に使うナレーター名 (env: MOCA_NARRATOR)。
    pub narrator: String,
}

impl Config {
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        // TS 版と同じ既定: リポジトリ直下の moca.db (相対パスは起動ディレクトリ基準)
        let db_path = env::var("DATABASE_PATH").unwrap_or_else(|_| "./moca.db".to_string());

        let voicepeak_path = env::var("VOICEPEAK").unwrap_or_else(|_| "voicepeak".to_string());
        let narrator = env::var("MOCA_NARRATOR").unwrap_or_else(|_| "Miyamai Moca".to_string());

        Self {
            port,
            db_path,
            voicepeak_path,
            narrator,
        }
    }
}
