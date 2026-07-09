use crate::analyze::Backend;
use crate::config::Config;
use crate::synth::SynthQueue;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    /// No async pool needed — SQLite is fast enough with a simple Mutex.
    /// Keep the guard within a {} block; holding it across .await violates Send.
    pub db: Arc<Mutex<Connection>>,
    /// voicepeak のパス / ナレーター名などの合成設定。
    pub config: Config,
    /// 合成のサーバー全体直列化キュー (VOICEPEAK は同時 1 プロセス制限)。
    pub synth: Arc<SynthQueue>,
    /// 感情分析 backend (ANALYZE_BACKEND から構築)。/analyze と流し込み acting が使う。
    pub analyzer: Arc<Backend>,
    /// 通知 pub/sub。/notify で send、/notify/stream で subscribe する broadcast。
    pub notify: tokio::sync::broadcast::Sender<String>,
}
