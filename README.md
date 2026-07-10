# moca-server

VOICEPEAK (宮舞モカ) の音声合成を HTTP でストリーミング配信する家庭内サーバー。
claude -p による感情パラメータの自動生成に対応。

```
クライアント / ブラウザ                サーバー
┌──────────────┐   POST /analyze  ┌─────────────────────────────┐
│ moca "..."    │ ───────────────▶ │ claude -p --model haiku      │
│   │           │ ◀─────────────── │   テキスト → 台本JSON         │
│   │ 台本JSON  │                  │                              │
│   ▼           │   POST /say      │ moca-server (Rust / axum)    │
│ (保存・編集可) │ ───────────────▶ │   segment毎に VOICEPEAK 起動  │
│   ▼           │ ◀─────────────── │   → 生PCM → Opus/WAV へ変換   │
│ ffplay 再生   │  audio/ogg (既定) └─────────────────────────────┘
└──────────────┘   (chunked)
```

文単位で逐次合成するため、1文目ができた時点（約1.2秒）で再生が始まる。

## 構成

- 単一の Rust バイナリ (`moca-server`) — Web サーバー (axum)。VOICEPEAK の起動・文分割・
  台本合成・Opus/WAV 変換・SPA 配信をすべて内蔵する
- `client/` — 管理画面 SPA (Svelte + Vite。`client/` 内で Bun でビルドし `client/build` へ出力)
- `bin/moca` — CLI クライアント (bash / curl / ffplay があれば動く)
- `bin/moca-notify` — 通知テキストを `POST /notify` に投げる薄いラッパー (bash / curl)

## API

| エンドポイント | 説明 |
|---|---|
| `GET /` | ブラウザ用の管理画面 (SPA) |
| `POST /analyze` (本文=テキスト) | claude -p で感情を推定し台本JSONを返す (約10秒)。`?carry=0〜0.9` で感情の引きずり量を調整 (デフォルト 1/3、0で無効) |
| `POST /say` (text/plain) | そのまま合成した音声をチャンク配信。既定は `audio/ogg` (Opus 64kbps)。`Accept: audio/wav` で可逆 WAV |
| `POST /say` (application/json) | 台本JSONを感情パラメータ付きで合成 (既定 Opus / `Accept: audio/wav` で WAV) |
| `GET /say?text=...` | text/plain 版と同じ (ブラウザの `<audio>` 向け) |
| `GET /api/projects/:id/lines/:lineId/audio.wav` | 保存済みの行を合成して WAV で返す (動画素材は可逆が正なので Accept 不問で常に WAV)。acting かつ script があれば台本経路、それ以外は text 文分割経路 |
| `POST /notify` (text/plain) | 本文を購読中の SPA に broadcast する。空文字は 400、それ以外は 204。永続化・再送なし (誰も購読していなければ捨てる) |
| `GET /notify/stream` | text/event-stream。通知購読の SSE ストリーム (管理画面ヘッダーのメガホン ON で接続) |

合成はサーバー全体で直列化される（VOICEPEAK CLI は同時 1 プロセスに制限されており、2 個目の起動は拒否されるため）。

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

必要なもの: VOICEPEAK と、下記いずれかの方法で用意した `moca-server` バイナリ。
感情分析を使うなら `claude` CLI (または OpenAI 互換 API) も。

#### 方法 A: ソースからビルド

必要なもの: [Rust toolchain](https://rustup.rs) (cargo)、システムの libopus、`pkg-config`、[Bun](https://bun.sh) (SPA ビルド用)。

```sh
# Debian/Ubuntu: sudo apt install pkg-config libopus-dev
# macOS: brew install opus pkg-config

git clone https://github.com/miyabisun/moca-server.git
cd moca-server
cp .env.example .env        # PORT / DATABASE_PATH / VOICEPEAK などを調整
(cd client && bun install && bun run build)   # 管理画面 SPA を client/build へビルド
cargo build --release       # 単一バイナリ target/release/moca-server を生成
./target/release/moca-server
```

`.env` は起動時に自動で読み込まれる。設定できる項目は下の「環境変数」を参照。

#### 方法 B: リリースバイナリを使う

[GitHub Releases](https://github.com/miyabisun/moca-server/releases) から
プラットフォーム向けの `moca-server` バイナリ (と SPA 成果物 `client-build.tar.gz`) を
取得する。`.sha256` で整合性を確認できる。SPA 成果物は実行ディレクトリの `client/build`
に展開してから起動する。

### クライアント側 (別マシンから叩く場合)

必要なもの: `bash`, `curl`, `ffmpeg` (再生に使う `ffplay` 同梱)。

```sh
# macOS: brew install ffmpeg
# Linux (Debian/Ubuntu): sudo apt install ffmpeg curl
# Windows: WSL または Git Bash + scoop/choco で ffmpeg / curl を入れる

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

### 通知購読 (`bin/moca-notify`)

`moca` が「今すぐ聞く」ワンショット再生なのに対し、`moca-notify` は
**購読中のブラウザに通知を届ける** pub/sub 用のクライアント。管理画面ヘッダー右上の
メガホントグルを ON にしておくと、`POST /notify` に届いたテキストを宮舞モカが
その場で読み上げる (`/analyze` は経由せず素の朗読、低レイテンシ)。永続化されない
fire-and-forget なので、誰も購読していなければ捨てられる。`MOCA_URL` は `moca` と共有する。

```sh
# インストール (クライアント側)
curl -o ~/bin/moca-notify https://raw.githubusercontent.com/miyabisun/moca-server/main/bin/moca-notify
chmod +x ~/bin/moca-notify

moca-notify "ビルドが完了しました"     # 引数で本文を渡す
echo "5分経過しました" | moca-notify   # stdin からも可
```

用途は「ssh ログイン先の tmux でベルが鳴ったら手元のブラウザで読み上げる」等。
tmux 連携例 (1 行):

```tmux
set-hook -g alert-bell 'run-shell "moca-notify \"#{session_name} が待ってます\""'
```

dotfiles 側の hook 実装本体は moca-server のスコープ外 (サーバーは「テキストを受けて
購読中の SPA に音声で届ける」だけを担当する)。

## キーボードショートカット

管理画面 SPA の「台本」タブでは vim 風のキー操作が使える。入力欄にフォーカス中・
モーダル表示中・IME 変換中・修飾キー併用時は無効。プロジェクト列と台本列の 2 ペインを
`h` / `l` で行き来し、`j` / `k` でカーソルを上下する。

| キー | 動作 |
|---|---|
| `h` / `l` | フォーカス列をプロジェクト / 台本へ移動 (移動先が空なら据え置き) |
| `j` / `k` | カーソルを下 / 上へ (端で停止) |
| `Enter` / `Space` | プロジェクトを開く / 台本行のアコーディオンを開閉 |
| `J` / `K` | 台本行を下 / 上へ並び替え |
| `yy` | 台本行をヤンク (コピー) |
| `dd` | 台本行を削除 (ヤンクに退避＝簡易 undo) |
| `p` / `P` | ヤンクした行をカーソルの下 / 上に貼り付け |
| `o` / `O` | 新規行をカーソルの下 / 上に追加 |
| `a` / `i` | 台本行のテキストを編集 (キャレット末尾 / 先頭) |
| `m` | 台本行のモードを切替 (アナウンサー ⇄ 演技) |
| `n` | ヘッダーの通知購読メガホンを ON/OFF |

`yy` / `dd` は 2 打鍵シーケンス (500ms 以内)。`J`〜`m` は台本列にフォーカスがある時のみ有効。
`n` はどちらの列でも効く。

## 環境変数

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
| `OPENAI_API_BASE` | — | `ANALYZE_BACKEND=openai` の時のエンドポイント (末尾の `/chat/completions` は自動付与)。OpenAI 本家 / Groq / LM Studio / Ollama `/v1` / vLLM / LocalAI などが刺さる |
| `OPENAI_API_KEY` | — | 同上。ローカル LLM で不要ならダミー値でよい |
| `OPENAI_MODEL` | — | 同上。渡すモデル ID |

### 感情分析 backend の切替

`/analyze` と流し込み (演技モード) は `ANALYZE_BACKEND` で選んだ backend を経由する。安全側の既定は `none` (呼ぶと 502 を返す)。

- **`cli`** — `ANALYZE_CMD` に指定したコマンドを `sh -c` 経由で起動する。プロトコルは「stdin = プロンプト全文, stdout = 台本 JSON 配列」の 1 本だけ。`claude -p --model haiku` はもちろん、`ollama run llama3` や `curl … | jq …` のようなワンライナーも書ける。認証は各 CLI 任せ。**依存**: 指定したコマンド本体 (`claude` / `ollama` / `curl` など) を別途インストールしておく必要がある。既定の `claude` は [Claude Code CLI](https://claude.com/product/claude-code) が入っていれば動く。
- **`openai`** — `POST {OPENAI_API_BASE}/chat/completions` に `{model, messages:[{role:"user", content: プロンプト}]}` を投げ、`choices[0].message.content` を台本 JSON として解釈する。OpenAI Chat Completions 互換ならほぼそのまま通る。**依存**: 外部の HTTP エンドポイントのみ (追加インストール不要)。ローカル LLM (LM Studio / Ollama `/v1` / vLLM / LocalAI) に向ければ課金なしで動く。
- **`none`** — `/analyze` を封じる。台本を手書きするか、事前生成した JSON だけを `/say` に投げる運用向け。**依存**: なし。

## テスト

- サーバー側 (Rust): `cargo test` で各モジュールのユニットテストが走る。
- クライアント側 (Svelte SPA): 自動テスト (ユニット/E2E) は未整備。
  変更後は `bun run dev` (または `npm run dev`) でブラウザから以下を手動確認すること:
  - 初回ロード時、プロジェクトが1件のみの状態でもプロジェクト列の先頭にフォーカス表示が出ていること
  - その状態で `j` / `k` を押してもフォーカス表示が消えず、境界で停止すること
  - 上記「キーボードショートカット」表の各キー (`h`/`l`, `j`/`k`, `yy`/`dd`, `p`/`P`, `o`/`O`, `a`/`i`, `m`, `n`) が一覧どおりに動作すること
  - ページをリロードした直後に `n` でメガホンが ON になり、通知音声が再生されること (Safari 等の autoplay 制限下でも)

## 制限

- VOICEPEAK CLI は 1 回の `-s` に渡せる文字数に上限があるため、
  1 文が極端に長い（140字超）と失敗することがある。
- VOICEPEAK は稀に起動直後に失敗することがあるため、サーバーは
  segment ごとに最大3回リトライする。
- `/analyze` の消費（API 料金 / CLI サブスクリプション枠）は選択した backend の請求元にそのまま乗る。
- 認証なしの家庭内 LAN 専用。インターネットに公開しないこと。

## 常駐化 (systemd)

**Docker での運用は非対応** (実測: VOICEPEAK はコンテナ内でのみ合成を拒否する。
ライブラリ・デバイス・環境変数を揃えても再現し、コンテナ検知と推定)。
サーバーはネイティブバイナリを systemd (user scope) で常駐させる:

```ini
# ~/.config/systemd/user/moca-server.service
[Unit]
Description=moca-server
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/moca-server
WorkingDirectory=%h/.local/share/moca-server
EnvironmentFile=%h/.config/moca-server/.env
Restart=on-failure

[Install]
WantedBy=default.target
```

- バイナリは `~/.local/bin/moca-server`、SPA 成果物 (`client-build.tar.gz` を展開した
  `client/build`) は `WorkingDirectory` 配下に置く
- `.env` (EnvironmentFile) に PORT / DATABASE_PATH / VOICEPEAK 等を書く
- `systemctl --user enable --now moca-server` で常駐開始
- 自動更新したい場合は GitHub Releases の `releases.atom` を systemd timer で監視して
  新タグを検出 → SHA256 検証 → `install(1)` で差し替え → restart する構成が組める

## ライセンス

本リポジトリのコード (moca-server 本体) は [MIT ライセンス](./LICENSE) の下で配布する。

ただし本リポジトリは音声合成エンジン **VOICEPEAK 本体および音源データを一切含まない**。VOICEPEAK / 宮舞モカ (およびその他の音源) は AH-Software 株式会社の商用製品であり、その利用条件は同社のライセンスに従うこと。moca-server 側の MIT ライセンスは VOICEPEAK 本体には及ばない。
