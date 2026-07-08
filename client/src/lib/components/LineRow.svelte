<script>
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmotionChips from '$lib/components/EmotionChips.svelte';
	import EmotionEditor from '$lib/components/EmotionEditor.svelte';

	// One line row: play button, text, emotion chips (acting only), mode badge,
	// overflow menu. Tapping the body expands the inline editor. The currently
	// playing row shows a 4px accent left bar (chrome, not data).
	let {
		line,
		rev = 0,
		playing = false,
		loading = false,
		spinner = false,
		onplay,
		onsave,
		onrequestDelete,
		onrequestReanalyze
	} = $props();

	let expanded = $state(false);
	let menuOpen = $state(false);

	// Seed the local draft once from the (stable, keyed) line prop.
	let draftText = $state(untrack(() => line.text));
	let textTimer = null;

	function saveText() {
		clearTimeout(textTimer);
		textTimer = setTimeout(() => {
			const t = draftText.trim();
			if (t && t !== line.text) onsave?.(line, { text: t });
		}, 400);
	}

	function saveScript(script) {
		onsave?.(line, { script });
	}

	function toggleExpand(e) {
		// Ignore clicks that originate from interactive controls in the row header.
		if (e.target.closest('button, a, input, textarea')) return;
		expanded = !expanded;
	}

	function onBodyKey(e) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			expanded = !expanded;
		}
	}
</script>

<div class="row" class:playing>
	<div class="header">
		<button
			type="button"
			class="play"
			class:active={playing}
			aria-label={playing ? '停止' : '再生'}
			onclick={() => onplay?.(line)}
		>
			{#if spinner}
				<Spinner size="1rem" />
			{:else}
				<Icon name={playing ? 'stop' : 'play'} />
			{/if}
		</button>

		<div
			class="body"
			role="button"
			tabindex="0"
			aria-expanded={expanded}
			onclick={toggleExpand}
			onkeydown={onBodyKey}
		>
			<p class="text">{line.text}</p>
			{#if line.mode === 'acting'}
				<EmotionChips script={line.script} />
			{/if}
		</div>

		<span class="badge" class:acting={line.mode === 'acting'}>
			{line.mode === 'acting' ? '演技' : 'アナ'}
		</span>

		<div class="menu-wrap">
			<button type="button" class="icon-btn" aria-label="メニュー" onclick={() => (menuOpen = !menuOpen)}>
				<Icon name="more" />
			</button>
			{#if menuOpen}
				<button type="button" class="menu-scrim" aria-label="メニューを閉じる" onclick={() => (menuOpen = false)}></button>
				<div class="menu">
					<button type="button" onclick={() => { menuOpen = false; expanded = !expanded; }}>編集</button>
					{#if line.mode === 'acting'}
						<button type="button" onclick={() => { menuOpen = false; onrequestReanalyze?.(line); }}>再分析</button>
					{/if}
					<button type="button" class="danger" onclick={() => { menuOpen = false; onrequestDelete?.(line); }}>削除</button>
				</div>
			{/if}
		</div>
	</div>

	{#if expanded}
		<div class="expansion">
			{#if line.mode === 'acting' && line.script}
				<!-- Remount (re-seed) only when reanalyze bumps rev, not on autosave reloads. -->
				{#key rev}
					<EmotionEditor script={line.script} onsave={saveScript} />
				{/key}
			{:else}
				<textarea
					bind:value={draftText}
					oninput={saveText}
					rows="2"
					aria-label="行テキスト"
				></textarea>
			{/if}
		</div>
	{/if}
</div>

<style lang="sass">
.row
	position: relative
	padding: var(--sp-2) var(--sp-3)
	border-radius: var(--radius-md)
	background: var(--c-surface)
	border: 1px solid var(--c-border)

	&.playing
		border-left: 4px solid var(--c-accent)
		padding-left: calc(var(--sp-3) - 3px)

.header
	display: flex
	align-items: center
	gap: var(--sp-2)

.play
	display: flex
	align-items: center
	justify-content: center
	flex: none
	width: 36px
	height: 36px
	padding: 0
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)
	background: var(--c-surface)
	color: var(--c-text)
	cursor: pointer

	&:hover
		background: var(--c-overlay-2)

	&.active
		color: var(--c-accent)
		border-color: var(--c-accent-border)

.body
	flex: 1
	min-width: 0
	cursor: pointer

	.text
		margin: 0
		font-size: var(--fs-sm)
		display: -webkit-box
		-webkit-line-clamp: 2
		-webkit-box-orient: vertical
		overflow: hidden

.badge
	flex: none
	padding: 1px var(--sp-2)
	border-radius: var(--radius-full)
	font-size: var(--fs-xs)
	color: var(--c-text-muted)
	border: 1px solid var(--c-border)

	&.acting
		color: var(--c-text-sub)

.menu-wrap
	position: relative
	flex: none

.icon-btn
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

.menu-scrim
	position: fixed
	inset: 0
	z-index: 5
	border: none
	padding: 0
	background: transparent
	cursor: default

.menu
	position: absolute
	right: 0
	top: 100%
	z-index: 6
	display: flex
	flex-direction: column
	min-width: 8rem
	padding: var(--sp-1)
	border-radius: var(--radius-lg)
	background: var(--c-surface)
	border: 1px solid var(--c-border)
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25)

	button
		padding: var(--sp-2) var(--sp-3)
		text-align: left
		background: transparent
		border: none
		border-radius: var(--radius-sm)
		color: var(--c-text)
		font-size: var(--fs-sm)
		cursor: pointer

		&:hover
			background: var(--c-overlay-2)

		&.danger
			color: var(--c-danger)

.expansion
	margin-top: var(--sp-3)

	textarea
		width: 100%
		padding: var(--sp-2)
		font-family: inherit
		font-size: var(--fs-sm)
		color: var(--c-text)
		background: var(--c-bg)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)
		resize: vertical

		&:focus
			border-color: var(--c-accent)
</style>
