<script>
	import Modal from '$lib/components/Modal.svelte';

	let { onclose, oncommit } = $props();
	let surface = $state('');
	let reading = $state('');
	let saving = $state(false);

	function focusInput(node) {
		node.focus();
	}

	async function commit() {
		const s = surface.trim();
		const r = reading.trim();
		if (!s || !r || saving) return;
		saving = true;
		try {
			await oncommit?.(s, r);
			onclose?.();
		} catch {
			// The caller owns the error toast; keep the modal open for correction.
		} finally {
			saving = false;
		}
	}

	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Modal title="辞書項目を追加" onclose={onclose} maxWidth="30rem">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			void commit();
		}}
	>
		<label>
			<span>表記</span>
			<input bind:value={surface} use:focusInput aria-label="表記" placeholder="例: GPU" />
		</label>
		<label>
			<span>読み</span>
			<input bind:value={reading} aria-label="読み" placeholder="例: ジーピーユー" />
		</label>
		<div class="actions">
			<button type="button" class="quiet" onclick={() => onclose?.()}>キャンセル</button>
			<button type="submit" class="primary" disabled={saving || !surface.trim() || !reading.trim()}>
				追加
			</button>
		</div>
	</form>
</Modal>

<style lang="sass">
form
	display: flex
	flex-direction: column
	gap: var(--sp-3)

label
	display: flex
	flex-direction: column
	gap: var(--sp-1)
	font-size: var(--fs-sm)
	color: var(--c-text-sub)

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
	margin-top: var(--sp-2)

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
