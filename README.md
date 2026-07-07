# moca-server

VOICEPEAK (宮舞モカ) の音声合成を HTTP でストリーミング配信する家庭内サーバー。
claude -p による感情パラメータの自動生成に対応。

```
Mac / ブラウザ (client)              Manjaro (server)
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
- `bin/moca` — Mac 側クライアント

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

### サーバー側 (このマシン)

VOICEPEAK が `~/tools/Voicepeak/`、ffmpeg / jq / bun / claude CLI が入っていれば:

```sh
bun install
bun start        # PORT=3000
```

### Mac 側

```sh
brew install ffmpeg
scp manjaro:projects/moca-server/bin/moca ~/bin/moca
chmod +x ~/bin/moca
```

## 使い方 (Mac から)

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

# ブラウザから: http://manjaro:3000/ (そのまま再生 / 感情分析して再生)

# curl 直叩き (感情なし・低レイテンシ)
curl -sN --data-binary "テキスト" http://manjaro:3000/say | ffplay -nodisp -autoexit -
```

`moca` は入力の (空白を除いた) 先頭が `[`・末尾が `]` なら台本JSONとみなして
`/analyze` をスキップし、直接 `/say` に投げる。

## 環境変数

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3000` | サーバーのポート番号 |
| `MOCA_URL` | `http://manjaro:3000` | サーバーの URL (クライアント側) |
| `MOCA_NARRATOR` | `Miyamai Moca` | ナレーター名 (moca-render) |
| `VOICEPEAK` | `~/tools/Voicepeak/voicepeak` | voicepeak バイナリ (moca-render) |

## 制限

- VOICEPEAK CLI は 1 回の `-s` に渡せる文字数に上限があるため、
  1 文が極端に長い（140字超）と失敗することがある。
- VOICEPEAK は稀に起動直後に失敗することがあるため、moca-render は
  segment ごとに最大3回リトライする。
- `/analyze` はサーバー上の claude CLI（サブスクリプション認証）を使う。
  消費は普段の対話利用と同じ枠から引かれる。
- 認証なしの家庭内 LAN 専用。インターネットに公開しないこと。
