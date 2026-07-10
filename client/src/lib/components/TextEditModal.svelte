<script>
	import Modal from '$lib/components/Modal.svelte';

	// Single-line text editor for a line, pre-filled with the current text. This
	// is the ONLY way to change a line's text. Enter / primary commits, Esc cancels.
	// `caret`: 'end' → caret at input end (vim a), 'start' → at start (vim i),
	// undefined → select-all (menu default). `acting` shows the re-analyze notice.
	// `title` / `label` default to the line-text wording; the project-title edit
	// reuses this shell with its own copy and acting=false.
	let {
		text = '',
		caret = undefined,
		acting = false,
		title = 'テキスト編集',
		label = '行テキスト',
		onclose,
		oncommit
	} = $props();

	// Seeded once from the prop: the modal remounts per edit, so the initial
	// capture is exactly the prefill we want.
	// svelte-ignore state_referenced_locally
	let draft = $state(text);

	function focusInput(node) {
		node.focus();
		if (caret === 'end') node.setSelectionRange(node.value.length, node.value.length);
		else if (caret === 'start') node.setSelectionRange(0, 0);
		else node.select?.();
	}

	function commit() {
		const t = draft.trim();
		if (t && t !== text) oncommit?.(t);
		onclose?.();
	}

	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Modal {title} onclose={onclose} maxWidth="30rem">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			commit();
		}}
	>
		<input type="text" bind:value={draft} use:focusInput aria-label={label} />
		{#if acting}
			<p class="notice">保存すると感情分析をやり直します（〜10秒・現在の演技指定は破棄）。</p>
		{/if}
		<div class="actions">
			<button type="button" class="quiet" onclick={() => onclose?.()}>キャンセル</button>
			<button type="submit" class="primary" disabled={!draft.trim()}>保存</button>
		</div>
	</form>
</Modal>

<style lang="sass">
input
	width: 100%
	padding: var(--sp-3)
	font-family: inherit
	font-size: var(--fs-md)
	color: var(--c-text)
	background: var(--c-bg)
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)

	&:focus
		border-color: var(--c-accent)

// Re-analyze warning for acting lines: state the real ~10s latency and script loss.
.notice
	margin: var(--sp-2) 0 0
	font-size: var(--fs-xs)
	color: var(--c-text-sub)

.actions
	display: flex
	justify-content: flex-end
	gap: var(--sp-2)
	margin-top: var(--sp-4)

	button
		padding: var(--sp-2) var(--sp-4)
		font-size: var(--fs-md)
		border-radius: var(--radius-sm)
		cursor: pointer

	.quiet
		background: transparent
		border: 1px solid var(--c-border)
		color: var(--c-text-sub)

	.primary
		background: var(--c-accent-strong)
		border: 1px solid var(--c-accent-strong)
		color: var(--c-on-accent)

		&:disabled
			opacity: 0.5
			cursor: not-allowed
</style>
