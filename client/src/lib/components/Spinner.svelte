<script>
	// Loading spinner per Sumi: 1.5px-stroke circle in accent, ~1.1rem.
	let { size = '1.1rem' } = $props();
</script>

<span class="spinner" style="--size: {size}" aria-label="読み込み中"></span>

<style lang="sass">
.spinner
	display: inline-block
	width: var(--size)
	height: var(--size)
	border: 1.5px solid var(--c-accent-border)
	border-top-color: var(--c-accent)
	border-radius: var(--radius-full)
	animation: spin 0.7s linear infinite

@keyframes spin
	to
		transform: rotate(360deg)
</style>
