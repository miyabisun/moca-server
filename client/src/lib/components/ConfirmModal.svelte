<script>
	import Icon from '$lib/components/Icon.svelte';

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

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="scrim" onclick={() => oncancel?.()}>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
		<div class="head">
			<h2>{title}</h2>
			<button type="button" class="close" aria-label="閉じる" onclick={() => oncancel?.()}>
				<Icon name="x" />
			</button>
		</div>
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
	</div>
</div>

<style lang="sass">
.scrim
	position: fixed
	inset: 0
	z-index: 1000
	display: flex
	align-items: center
	justify-content: center
	background: var(--c-scrim)
	padding: var(--sp-4)

.modal
	width: 100%
	max-width: 26rem
	max-height: 80dvh
	overflow: auto
	padding: var(--sp-4)
	border-radius: var(--radius-lg)
	background: var(--c-surface)
	border: 1px solid var(--c-border)
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25)

.head
	display: flex
	align-items: center
	justify-content: space-between
	gap: var(--sp-2)

	h2
		margin: 0
		font-size: var(--fs-xl)
		font-weight: 600

.close
	display: flex
	align-items: center
	justify-content: center
	width: 36px
	height: 36px
	padding: 0
	border: none
	border-radius: var(--radius-sm)
	background: transparent
	color: var(--c-text-sub)
	cursor: pointer

	&:hover
		color: var(--c-text)

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
		background: var(--c-accent)
		border: 1px solid var(--c-accent)
		color: var(--c-on-accent)

		&.danger
			background: var(--c-danger)
			border-color: var(--c-danger)

		&:disabled
			opacity: 0.5
			cursor: wait
</style>
