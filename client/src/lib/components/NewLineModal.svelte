<script>
	import Modal from '$lib/components/Modal.svelte';

	// Single-line "add a line" modal for the o / O shortcuts. Unlike PourInModal it
	// has no mode control: new lines are always アナウンサー. Enter / primary commits.
	let { onclose, oncommit } = $props();

	let draft = $state('');

	function focusInput(node) {
		node.focus();
	}

	function commit() {
		const t = draft.trim();
		if (!t) return;
		oncommit?.(t);
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

<Modal title="行を追加" onclose={onclose} maxWidth="30rem">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			commit();
		}}
	>
		<input type="text" bind:value={draft} use:focusInput aria-label="行テキスト" />
		<div class="actions">
			<button type="button" class="quiet" onclick={() => onclose?.()}>キャンセル</button>
			<button type="submit" class="primary" disabled={!draft.trim()}>追加</button>
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
