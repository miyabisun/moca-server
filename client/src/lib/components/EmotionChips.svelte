<script>
	import { EMOTIONS, summarizeEmotion } from '$lib/emotions.js';

	// Caption-size value chips for a line's script. Only axes present in the JSON,
	// in the fixed axis order, tinted with the axis color. Announcer rows never
	// render this component (colorless by definition).
	let { script } = $props();

	let summary = $derived(summarizeEmotion(script));
	let chips = $derived(EMOTIONS.filter((e) => e.key in summary));
</script>

{#if chips.length > 0}
	<span class="chips">
		{#each chips as e (e.key)}
			<span class="chip" style="--emo: {e.color}">{e.label} {summary[e.key]}</span>
		{/each}
	</span>
{/if}

<style lang="sass">
.chips
	display: inline-flex
	flex-wrap: wrap
	gap: var(--sp-1)

.chip
	padding: 1px var(--sp-2)
	border-radius: var(--radius-sm)
	font-size: var(--fs-xs)
	line-height: 1.5
	white-space: nowrap
	color: var(--emo)
	background: color-mix(in srgb, var(--emo) 16%, transparent)
</style>
