<script>
	import Modal from '$lib/components/Modal.svelte';

	// Shortcut cheat-sheet. Mirrors the README shortcut table; opened by `?` or the
	// footer help button. Neutral chrome only — keys are quiet outline chips, no
	// accent/emotion color. Esc closes (Modal itself does not handle keys).
	let { onclose } = $props();

	// [key, action] rows. Kept in sync with the README shortcut table.
	const rows = [
		['h / l', 'フォーカス列をプロジェクト / 台本へ移動'],
		['j / k', 'カーソルを下 / 上へ'],
		['Enter', 'プロジェクトを開く / 台本行のアコーディオンを開閉'],
		['Space', 'フォーカス中の対象を再生 / 停止'],
		['J / K', '台本行を下 / 上へ並び替え'],
		['yy', '台本行をヤンク (コピー)'],
		['dd', '台本行を削除 (ヤンクに退避)'],
		['p / P', 'ヤンクした行をカーソルの下 / 上に貼り付け'],
		['o / O', '新規行をカーソルの下 / 上に追加'],
		['a / i', 'タイトル / 台本行のテキストを編集 (キャレット末尾 / 先頭)'],
		['m', '台本行のモードを切替 (アナウンサー ⇄ 演技)'],
		['n', 'ヘッダーの通知購読メガホンを ON / OFF'],
		['?', 'このショートカット一覧を表示']
	];

	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Modal title="ショートカット" onclose={onclose} maxWidth="32rem">
	<dl class="rows">
		{#each rows as [key, action]}
			<div class="row">
				<dt><kbd>{key}</kbd></dt>
				<dd>{action}</dd>
			</div>
		{/each}
	</dl>
</Modal>

<style lang="sass">
.rows
	margin: 0
	display: flex
	flex-direction: column
	gap: var(--sp-2)

.row
	display: grid
	grid-template-columns: 7rem 1fr
	align-items: baseline
	gap: var(--sp-3)

dt
	margin: 0

// Quiet outline chip, matching the mode badge's "static outline badge" language.
// No accent or emotion color — neutral chrome only.
kbd
	display: inline-block
	padding: 1px var(--sp-2)
	font-family: inherit
	font-size: var(--fs-xs)
	color: var(--c-text)
	background: transparent
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)

dd
	margin: 0
	font-size: var(--fs-sm)
	color: var(--c-text-sub)
</style>
