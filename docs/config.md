# 設定 (環境変数)

サーバー側は `.env`（`.env.example` からコピー）または直接 export で設定する。`moca-server` は起動時に `.env` を自動で読み込む。

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3000` | サーバーの待受ポート |
| `DATABASE_PATH` | `./moca.db` | SQLite ファイルの場所。絶対パス推奨。相対パスは起動ディレクトリ基準 |
| `VOICEPEAK` | `voicepeak` | voicepeak バイナリの**絶対パス** (サーバーがセグメントごとに直接起動する)。VOICEPEAK は単一バイナリではなく `dic/` `fonts/` `settings/` 等の兄弟ディレクトリを起動時に参照するため、インストール先 (例: `~/tools/Voicepeak/voicepeak`) をそのまま指定する。PATH に通したいなら `~/.local/bin/voicepeak` にラッパースクリプトを置いて `exec $HOME/tools/Voicepeak/voicepeak "$@"` させる方式が確実 |
| `MOCA_NARRATOR` | `Miyamai Moca` | ナレーター名 (`-n` として voicepeak に渡す)。VOICEPEAK にインストール済みの音源名を指定 |
| `MOCA_URL` | `http://localhost:3000` | サーバーの URL (クライアント `bin/moca` が参照) |
| `ANALYZE_BACKEND` | `none` | 感情分析の実行方式。`none` (無効) / `cli` (任意の LLM CLI) / `openai` (OpenAI 互換 API) |
| `ANALYZE_CMD` | `claude -p --model haiku` | `ANALYZE_BACKEND=cli` の時に起動するコマンド。stdin にプロンプトが流れ、stdout に台本 JSON 配列を返せば良い |
| `OPENAI_API_BASE` | — | `ANALYZE_BACKEND=openai` の時のエンドポイント (末尾の `/chat/completions` は自動付与)。OpenAI 本家 / Gemini 互換 / Groq / LM Studio / Ollama `/v1` / vLLM / LocalAI などが刺さる |
| `OPENAI_API_KEY` | — | 同上。ローカル LLM で不要ならダミー値でよい |
| `OPENAI_MODEL` | — | 同上。渡すモデル ID |
| `BEP_DICT_PATH` | `./bep-eng.dic` | 英単語→カタカナのフォールバック辞書のキャッシュ場所 |
| `BEP_DICT_URL` | (alkana 派生 CSV) | フォールバック辞書の取得元。キャッシュが無ければ起動時に一度だけダウンロードし、失敗したらフォールバック無効のまま起動を続行する |

## 感情分析 backend の切替

`/analyze` と流し込み (演技モード) は `ANALYZE_BACKEND` で選んだ backend を経由する。安全側の既定は `none` (呼ぶと 502 を返す)。

- **`cli`** — `ANALYZE_CMD` に指定したコマンドを `sh -c` 経由で起動する。プロトコルは「stdin = プロンプト全文, stdout = 台本 JSON 配列」の 1 本だけ。`claude -p --model haiku` はもちろん、`ollama run llama3` や `curl … | jq …` のようなワンライナーも書ける。認証は各 CLI 任せ。**依存**: 指定したコマンド本体 (`claude` / `ollama` / `curl` など) を別途インストールしておく必要がある。既定の `claude` は [Claude Code CLI](https://claude.com/product/claude-code) が入っていれば動く。
- **`openai`** — `POST {OPENAI_API_BASE}/chat/completions` に `{model, messages:[{role:"user", content: プロンプト}]}` を投げ、`choices[0].message.content` を台本 JSON として解釈する。OpenAI Chat Completions 互換ならほぼそのまま通る。**依存**: 外部の HTTP エンドポイントのみ (追加インストール不要)。ローカル LLM (LM Studio / Ollama `/v1` / vLLM / LocalAI) に向ければ課金なしで動く。
- **`none`** — `/analyze` を封じる。台本を手書きするか、事前生成した JSON だけを `/say` に投げる運用向け。**依存**: なし。

## 英単語→カタカナのフォールバック辞書

tmux セッション名などの英単語 (例: `comic`) がスペル読みされる問題への対策として、
SQLite の読み替え辞書の後段に英単語→カタカナのフォールバック辞書が入る。

- 適用は SQLite 辞書と同じ全経路 (say plain/script、audio.wav script/text)。`?raw=1` ではスキップ
- 完全一致した英字トークンのみ置換 (大文字小文字無視)。未収録語は素通し
- 辞書は GPLv2 系のためリポジトリに同梱せず、起動時に `BEP_DICT_URL` から取得して
  `BEP_DICT_PATH` にキャッシュする。bep-eng.dic 原本 (Shift_JIS・半角カナ) と
  alkana 派生 CSV (UTF-8) の両形式を透過的に読める
- 管理画面の辞書 CRUD には出てこない静的な下位ティア
