<script>
	import Modal from '$lib/components/Modal.svelte';

	// Confirm dialog per Sumi modal recipe: scrim + centered card, Esc / × / scrim
	// to cancel, one primary action. `danger` styles the confirm button as destructive.
	let {
		title,
		message = '',
		confirmLabel = 'OK',
		danger = false,
		busy = false,
		onconfirm,
		oncancel
	} = $props();

	function onKeydown(e) {
		if (e.key === 'Escape') oncancel?.();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Modal {title} onclose={oncancel}>
	{#if message}
		<p class="message">{message}</p>
	{/if}
	<div class="actions">
		<button type="button" class="quiet" onclick={() => oncancel?.()}>キャンセル</button>
		<button
			type="button"
			class="primary"
			class:danger
			disabled={busy}
			onclick={() => onconfirm?.()}
		>
			{busy ? '処理中…' : confirmLabel}
		</button>
	</div>
</Modal>

<style lang="sass">
.message
	margin: var(--sp-3) 0 0
	font-size: var(--fs-sm)
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

		&.danger
			background: var(--c-danger)
			border-color: var(--c-danger)

		&:disabled
			opacity: 0.5
			cursor: wait
</style>
