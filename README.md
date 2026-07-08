# moca-server

VOICEPEAK (宮舞モカ) の音声合成を HTTP でストリーミング配信する家庭内サーバー。
claude -p による感情パラメータの自動生成に対応。

```
クライアント / ブラウザ                サーバー
┌──────────────┐   POST /analyze  ┌─────────────────────────────┐
│ moca "..."    │ ───────────────▶ │ claude -p --model haiku      │
│   │           │ ◀─────────────── │   テキスト → 台本JSON         │
│   │ 台本JSON  │                  │                              │
│   ▼           │   POST /say      │ moca-server (Bun + Hono)     │
│ (保存・編集可) │ ───────────────▶ │   └─ bin/moca-render         │
│   ▼           │ ◀─────────────── │       segment毎に VOICEPEAK   │
│ ffplay 再生   │   audio/wav      │       → 生PCM → WAVヘッダ     │
└──────────────┘   (chunked)      └─────────────────────────────┘
```

文単位で逐次合成するため、1文目ができた時点（約1.2秒）で再生が始まる。

## 構成

- `src/` — Web サーバー (Bun + Hono)
- `bin/moca-render` — 合成エンジン。台本 JSONL → 生PCM (s16le / 48kHz / mono)
- `bin/moca-say` — テキストを文分割して JSONL に変換し moca-render に渡すラッパー
- `bin/moca` — CLI クライアント (bash / curl / ffplay があれば動く)

## API

| エンドポイント | 説明 |
|---|---|
| `GET /` | ブラウザ用の動作確認ページ |
| `POST /analyze` (本文=テキスト) | claude -p で感情を推定し台本JSONを返す (約10秒)。`?carry=0〜0.9` で感情の引きずり量を調整 (デフォルト 1/3、0で無効) |
| `POST /say` (text/plain) | そのまま合成した WAV をチャンク配信 |
| `POST /say` (application/json) | 台本JSONを感情パラメータ付きで合成 |
| `GET /say?text=...` | text/plain 版と同じ (ブラウザの `<audio>` 向け) |

合成はサーバー全体で直列化される（VOICEPEAK の多重起動が不安定なため）。

### 台本JSONスキーマ

Segment の配列 (1要素 = 1文)。一息のボイスなら要素1つの配列になる:

```json
[
  { "text": "やった、ついに完成した！", "emotion": { "doyaru": 85 }, "speed": 110, "pitch": 20, "pause": 200 },
  { "text": "でも、ちょっと疲れたかも……。", "emotion": { "bosoboso": 43, "doyaru": 38 }, "speed": 95 }
]
```

- `emotion` — bosoboso / doyaru / honwaka / angry / teary (各 0-100)。省略可
- `speed` (50-200) / `pitch` (-300〜300) — 文単位で上書き。省略可
- `pause` — 文の後の無音 (ms)。省略可
- 範囲外の値はクランプ、未知の感情軸は無視される

`/analyze` は文単位の感情の急変を防ぐため、LLM の推定結果に指数移動平均をかけてから返す:
`実効値[i] = (1 - carry) × 自身の値 + carry × 実効値[i-1]`（感情・speed・pitch が対象、pause は対象外）。
1文目はそのまま。前の文の感情が carry (デフォルト 1/3) ずつ減衰しながら後続の文に乗る。

## セットアップ

### サーバー側

必要なもの: [Bun](https://bun.sh), VOICEPEAK, `ffmpeg`, `jq`, `claude` CLI。

```sh
git clone https://github.com/miyabisun/moca-server.git
cd moca-server
bun install
cp .env.example .env       # PORT / DATABASE_PATH / VOICEPEAK などを調整
bun run build              # 管理画面 SPA をビルド
bun start
```

`.env` は Bun が起動時に自動で読み込む。設定できる項目は下の「環境変数」を参照。

### クライアント側 (別マシンから叩く場合)

必要なもの: `bash`, `curl`, `jq`, `ffmpeg` (再生に使う `ffplay` 同梱)。

```sh
# macOS: brew install ffmpeg jq
# Linux (Debian/Ubuntu): sudo apt install ffmpeg jq curl
# Windows: WSL または Git Bash + scoop/choco で ffmpeg / jq / curl を入れる

curl -o ~/bin/moca https://raw.githubusercontent.com/miyabisun/moca-server/main/bin/moca
chmod +x ~/bin/moca
export MOCA_URL=http://<server-host>:3000
```

## 使い方

```sh
# 感情分析つきで再生。台本JSONが stdout に表示される
moca "やった、ついに完成した！でも、ちょっと疲れたかも。"

# 台本を保存 → 微調整 → 同じ演技で何度でも再収録
moca "..." > take1.json
vim take1.json
moca < take1.json

# 感情分析なしでそのまま読み上げ (低レイテンシ。朗読・通知向け)
moca -r "ビルドが完了しました"
moca -r < novel.txt

# 通知の見張り (行単位の連続読み上げ)
tail -f app.log | grep --line-buffered ERROR | while read -r line; do moca -r "$line"; done

# ブラウザから: http://localhost:3000/ (そのまま再生 / 感情分析して再生)

# curl 直叩き (感情なし・低レイテンシ)
curl -sN --data-binary "テキスト" http://localhost:3000/say | ffplay -nodisp -autoexit -
```

`moca` は入力の (空白を除いた) 先頭が `[`・末尾が `]` なら台本JSONとみなして
`/analyze` をスキップし、直接 `/say` に投げる。

## 環境変数

サーバー側は `.env`（`.env.example` からコピー）または直接 export で設定する。Bun は起動時に `.env` を自動で読み込む。

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3000` | サーバーの待受ポート |
| `DATABASE_PATH` | `./moca.db` | SQLite ファイルの場所。絶対パス推奨。相対パスは起動ディレクトリ基準 |
| `VOICEPEAK` | `voicepeak` | voicepeak バイナリのパス (`bin/moca-render`)。PATH に通してあれば `voicepeak` のままで良い |
| `MOCA_NARRATOR` | `Miyamai Moca` | ナレーター名 (`bin/moca-render`)。VOICEPEAK にインストール済みの音源名を指定 |
| `MOCA_URL` | `http://localhost:3000` | サーバーの URL (クライアント `bin/moca` が参照) |
| `ANALYZE_BACKEND` | `none` | 感情分析の実行方式。`none` (無効) / `cli` (任意の LLM CLI) / `openai` (OpenAI 互換 API) |
| `ANALYZE_CMD` | `claude -p --model haiku` | `ANALYZE_BACKEND=cli` の時に起動するコマンド。stdin にプロンプトが流れ、stdout に台本 JSON 配列を返せば良い |
| `OPENAI_API_BASE` | — | `ANALYZE_BACKEND=openai` の時のエンドポイント (末尾の `/chat/completions` は自動付与)。OpenAI 本家 / Groq / LM Studio / Ollama `/v1` / vLLM / LocalAI などが刺さる |
| `OPENAI_API_KEY` | — | 同上。ローカル LLM で不要ならダミー値でよい |
| `OPENAI_MODEL` | — | 同上。渡すモデル ID |

### 感情分析 backend の切替

`/analyze` と流し込み (演技モード) は `ANALYZE_BACKEND` で選んだ backend を経由する。安全側の既定は `none` (呼ぶと 502 を返す)。

- **`cli`** — `ANALYZE_CMD` に指定したコマンドを `sh -c` 経由で起動する。プロトコルは「stdin = プロンプト全文, stdout = 台本 JSON 配列」の 1 本だけ。`claude -p --model haiku` はもちろん、`ollama run llama3` や `curl … | jq …` のようなワンライナーも書ける。認証は各 CLI 任せ。**依存**: 指定したコマンド本体 (`claude` / `ollama` / `curl` など) を別途インストールしておく必要がある。既定の `claude` は [Claude Code CLI](https://claude.com/product/claude-code) が入っていれば動く。
- **`openai`** — `POST {OPENAI_API_BASE}/chat/completions` に `{model, messages:[{role:"user", content: プロンプト}]}` を投げ、`choices[0].message.content` を台本 JSON として解釈する。OpenAI Chat Completions 互換ならほぼそのまま通る。**依存**: 外部の HTTP エンドポイントのみ (追加インストール不要)。ローカル LLM (LM Studio / Ollama `/v1` / vLLM / LocalAI) に向ければ課金なしで動く。
- **`none`** — `/analyze` を封じる。台本を手書きするか、事前生成した JSON だけを `/say` に投げる運用向け。**依存**: なし。

## 制限

- VOICEPEAK CLI は 1 回の `-s` に渡せる文字数に上限があるため、
  1 文が極端に長い（140字超）と失敗することがある。
- VOICEPEAK は稀に起動直後に失敗することがあるため、moca-render は
  segment ごとに最大3回リトライする。
- `/analyze` の消費（API 料金 / CLI サブスクリプション枠）は選択した backend の請求元にそのまま乗る。
- 認証なしの家庭内 LAN 専用。インターネットに公開しないこと。
