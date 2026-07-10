<script>
	import Modal from '$lib/components/Modal.svelte';

	// Line context menu (Sumi menu recipe): a full-width default-button stack
	// scoped to one line. Each click notifies the parent and closes the modal.
	let { onclose, onadd, onedit, onduplicate } = $props();

	function pick(action) {
		action?.();
		onclose?.();
	}
</script>

<Modal title="行メニュー" onclose={onclose} maxWidth="22rem">
	<div class="menu">
		<button type="button" onclick={() => pick(onadd)}>台本追加</button>
		<button type="button" onclick={() => pick(onedit)}>テキスト編集</button>
		<button type="button" onclick={() => pick(onduplicate)}>この行を複製</button>
	</div>
</Modal>

<style lang="sass">
.menu
	display: flex
	flex-direction: column
	gap: var(--sp-2)

	button
		width: 100%
		padding: var(--sp-3)
		background: var(--c-bg)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)
		color: var(--c-text)
		font-family: inherit
		font-size: var(--fs-md)
		text-align: left
		cursor: pointer

		&:hover
			background: var(--c-hover-2)
</style>
