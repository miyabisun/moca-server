<script>
	import { fade } from 'svelte/transition';
	import { getToasts } from '$lib/toast.svelte.js';

	let toasts = $derived(getToasts());
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div class="toast" class:danger={toast.role === 'danger'} transition:fade={{ duration: 200 }}>
				{toast.message}
			</div>
		{/each}
	</div>
{/if}

<style lang="sass">
.toast-container
	position: fixed
	bottom: 20px
	left: 50%
	transform: translateX(-50%)
	z-index: 9999
	display: flex
	flex-direction: column
	align-items: center
	gap: var(--sp-2)

.toast
	padding: var(--sp-2) var(--sp-5)
	border-radius: var(--radius-md)
	background: var(--c-surface)
	border: 1px solid var(--c-border)
	color: var(--c-text)
	font-size: var(--fs-sm)

	&.danger
		border-color: var(--c-danger-border)
		color: var(--c-danger)
</style>
