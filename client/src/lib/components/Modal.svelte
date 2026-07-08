<script>
	import Icon from '$lib/components/Icon.svelte';

	// Shared Sumi modal shell: scrim + centered card with a titled head and a
	// close (×). Both the scrim and the × invoke `onclose`. Callers supply the
	// body as children and own any keyboard handling (e.g. Esc).
	let { title, onclose, maxWidth = '26rem', maxHeight = '80dvh', children } = $props();
</script>

<div class="overlay">
	<button type="button" class="scrim" aria-label="閉じる" onclick={() => onclose?.()}></button>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		style="--modal-max-w: {maxWidth}; --modal-max-h: {maxHeight}"
	>
		<div class="head">
			<h2>{title}</h2>
			<button type="button" class="close" aria-label="閉じる" onclick={() => onclose?.()}>
				<Icon name="x" />
			</button>
		</div>
		{@render children?.()}
	</div>
</div>

<style lang="sass">
.overlay
	position: fixed
	inset: 0
	z-index: 1000
	display: flex
	align-items: center
	justify-content: center
	padding: var(--sp-4)

.scrim
	position: fixed
	inset: 0
	border: none
	padding: 0
	background: var(--c-scrim)
	cursor: default

.modal
	position: relative
	width: 100%
	max-width: var(--modal-max-w)
	max-height: var(--modal-max-h)
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
	margin-bottom: var(--sp-3)

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
</style>
