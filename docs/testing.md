# テスト

- サーバー側 (Rust): `cargo test` で各モジュールのユニットテストが走る。
- クライアント側 (Svelte SPA): E2E テスト (Playwright + Chromium) を整備済み。
  `client/` で `bun run test` を実行すると、`vite build && vite preview` を自動起動し
  (バックエンド・VOICEPEAK は不要。全 API は `page.route` でモックする) 全テストが走る。
  ブラウザ実体は Chromium (`~/.cache/ms-playwright`)。

## E2E のカバレッジ

`client/tests/*.spec.js`、ファイル名の番号が下記項目に対応:

1. 初回フォーカス: プロジェクト1件でもプロジェクト列先頭にフォーカスリングが出て、`j`/`k` が境界で停止しリングが消えないこと (`01-initial-focus`)
2. `l` ガード: プロジェクト未選択・0行プロジェクトでフォーカスがプロジェクト列に残ること (`02-l-guard`)
3. `h`/`l` 列切替、`Enter` でプロジェクトを開く、`Enter` で演技行のアコーディオン開閉 (アナ行は no-op、`Space` では開閉しない) (`03-columns-accordion`)
4. `yy` → `p`/`P`: ヤンク後のペーストで addLine (POST) と reorder (PUT) が正しい位置で発行されること (`04-yank-paste`)
5. `dd`: 確認なしで DELETE、フォーカスが次行 (末尾なら前行) へ追従、ヤンクレジスタから `p` で復元 (`05-dd-delete`)
6. `o`/`O`: 新規作成モーダルから正しい位置に挿入 (`06-new-line`)
7. `a`/`i`: 編集モーダルのキャレット位置 (末尾/先頭)、演技行の編集確定で `/analyze` 再実行 (`07-text-edit`)
8. `m`: アナ→演技は `/analyze`、演技→アナは ConfirmModal (`08-mode-toggle`)
9. `n`: メガホンの ON/OFF 切替 (`09-notify-megaphone`)
10. ガード: input フォーカス中・モーダル表示中・辞書タブではショートカットが発火しないこと (`10-guards`)
11. `Space`: フォーカス中の対象を再生/停止 (プロジェクト列＝通し再生・台本列＝単発)、再度押下で停止 (`11-space-play`)
12. `?`: ショートカット一覧モーダルを ? キー / フッターボタンから開閉、表示中は他ショートカット無効 (`12-help-modal`)
13. プロジェクト列の `a`/`i`: 未選択プロジェクトも含めタイトル編集、キャレット位置・PATCH 内容・一覧反映 (`13-project-rename`)

## E2E では担保できないため、リリース前に手動確認する項目

- ページをリロードした直後に `n` でメガホンが ON になり、通知音声が実際に再生されること (Safari 等の autoplay 制限下でも)
