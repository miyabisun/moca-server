<script>
	import { untrack } from 'svelte';
	import { EMOTIONS } from '$lib/emotions.js';

	// Inline emotion editor for an acting line. Per segment: the segment text,
	// five labeled axis sliders (axis-color fill), and three neutral steppers for
	// speed / pitch / pause. Every edit autosaves (debounced) via `onsave(script)`.
	let { script, onsave } = $props();

	// Editable local model: every axis materialized as a number so sliders bind cleanly.
	function toModel(segs) {
		return (segs ?? []).map((s) => {
			const emotion = {};
			for (const { key } of EMOTIONS) emotion[key] = s.emotion?.[key] ?? 0;
			return {
				text: s.text,
				emotion,
				speed: s.speed ?? 100,
				pitch: s.pitch ?? 0,
				pause: s.pause ?? 0
			};
		});
	}

	// Seed the editable model once from the incoming script (row is keyed per line).
	let segments = $state(untrack(() => toModel(script)));

	// Serialize back to the compact script shape: drop zero emotions and default
	// speed / pitch so chips and stored JSON stay clean.
	function toScript() {
		return segments.map((s) => {
			const out = { text: s.text };
			const emotion = {};
			for (const { key } of EMOTIONS) {
				if (s.emotion[key] > 0) emotion[key] = s.emotion[key];
			}
			if (Object.keys(emotion).length > 0) out.emotion = emotion;
			if (s.speed !== 100) out.speed = s.speed;
			if (s.pitch !== 0) out.pitch = s.pitch;
			if (s.pause > 0) out.pause = s.pause;
			return out;
		});
	}

	let timer = null;
	function scheduleSave() {
		clearTimeout(timer);
		timer = setTimeout(() => onsave?.(toScript()), 400);
	}

	function step(seg, field, delta, min, max) {
		seg[field] = Math.min(max, Math.max(min, seg[field] + delta));
		scheduleSave();
	}

	// Neutral (non-emotion) per-segment controls: field, label, range, step.
	const STEPPERS = [
		{ f: 'speed', label: '速さ', min: 50, max: 200, s: 5 },
		{ f: 'pitch', label: '高さ', min: -300, max: 300, s: 10 },
		{ f: 'pause', label: '間(ms)', min: 0, max: 10000, s: 50 }
	];
</script>

<div class="editor">
	{#each segments as seg, i (i)}
		<div class="segment">
			<p class="seg-text">{seg.text}</p>

			<div class="sliders">
				{#each EMOTIONS as e (e.key)}
					<label class="slider-row" style="--emo: {e.color}">
						<span class="axis">{e.label}</span>
						<input
							type="range"
							min="0"
							max="100"
							bind:value={seg.emotion[e.key]}
							oninput={scheduleSave}
						/>
						<span class="val">{seg.emotion[e.key]}</span>
					</label>
				{/each}
			</div>

			<div class="steppers">
				{#each STEPPERS as st (st.f)}
					<div class="stepper">
						<span class="axis">{st.label}</span>
						<div class="stepper-controls">
							<button type="button" aria-label="{st.label}を減らす" onclick={() => step(seg, st.f, -st.s, st.min, st.max)}>−</button>
							<span class="num">{seg[st.f]}</span>
							<button type="button" aria-label="{st.label}を増やす" onclick={() => step(seg, st.f, st.s, st.min, st.max)}>+</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style lang="sass">
.editor
	display: flex
	flex-direction: column
	gap: var(--sp-3)

.segment
	padding: var(--sp-3)
	border-radius: var(--radius-md)
	background: var(--c-bg)
	border: 1px solid var(--c-border)

.seg-text
	margin: 0 0 var(--sp-3)
	font-size: var(--fs-sm)
	color: var(--c-text)

.sliders
	display: flex
	flex-direction: column
	gap: var(--sp-1)

.slider-row
	display: grid
	grid-template-columns: 4.5rem 1fr 2.5rem
	align-items: center
	gap: var(--sp-2)

	.axis
		font-size: var(--fs-xs)
		color: var(--c-text-sub)

	input[type="range"]
		width: 100%
		accent-color: var(--emo)

	.val
		font-size: var(--fs-xs)
		color: var(--c-text-sub)
		text-align: right

.steppers
	display: flex
	flex-wrap: wrap
	gap: var(--sp-3)
	margin-top: var(--sp-3)

.stepper
	display: flex
	flex-direction: column
	gap: var(--sp-1)

	.axis
		font-size: var(--fs-xs)
		color: var(--c-text-sub)

.stepper-controls
	display: flex
	align-items: center
	gap: var(--sp-2)

	button
		width: 28px
		height: 28px
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)
		background: var(--c-surface)
		color: var(--c-text)
		cursor: pointer
		font-size: var(--fs-lg)
		line-height: 1

		&:hover
			background: var(--c-overlay-2)

	.num
		min-width: 3rem
		text-align: center
		font-size: var(--fs-sm)
		font-variant-numeric: tabular-nums
</style>
