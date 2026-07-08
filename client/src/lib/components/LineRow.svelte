<script>
	import Icon from '$lib/components/Icon.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmotionChips from '$lib/components/EmotionChips.svelte';
	import EmotionEditor from '$lib/components/EmotionEditor.svelte';

	// One line row, left to right: drag grip, play button, line text (inline
	// editable), emotion chips (acting only), mode toggle badge, delete button.
	// Clicking the text swaps it in place for an input[type=text]; on a 演技 line
	// it also expands the inline emotion editor. The playing row shows a 4px
	// accent left bar.
	let {
		line,
		rev = 0,
		playing = false,
		spinner = false,
		toggling = false,
		draggable = false,
		dragging = false,
		dropBefore = false,
		dropAfter = false,
		onplay,
		onsave,
		ontoggle,
		onrequestDelete,
		ondragstart,
		ondragover,
		ondrop,
		ondragend
	} = $props();

	let expanded = $state(false);
	let rowDraggable = $state(false);

	// --- Inline text edit: the text swaps in place for an input, no layout jump.
	// Enter / blur commit (trim; ignore empty or unchanged), Esc restores. ---
	let editing = $state(false);
	let draft = $state('');

	function saveScript(script) {
		onsave?.(line, { script });
	}

	function startEdit() {
		if (editing) return;
		draft = line.text;
		editing = true;
		// 演技: tapping the text also expands the emotion editor inline.
		if (line.mode === 'acting') expanded = true;
	}

	function focusInput(node) {
		node.focus();
		node.select?.();
	}

	function commitEdit() {
		if (!editing) return;
		editing = false;
		const t = draft.trim();
		if (t && t !== line.text) onsave?.(line, { text: t });
	}

	function cancelEdit() {
		editing = false; // draft is discarded; text falls back to line.text
	}

	function onInputKey(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	}

	// --- Drag: only the grip initiates it; the row is draggable only while held. ---
	function handleDragStart(e) {
		if (!draggable) {
			e.preventDefault();
			return;
		}
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', String(line.id));
		ondragstart?.(line);
	}

	function handleDragOver(e) {
		if (!draggable) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const rect = e.currentTarget.getBoundingClientRect();
		const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
		ondragover?.(line, pos);
	}

	function handleDrop(e) {
		e.preventDefault();
		ondrop?.();
	}

	function handleDragEnd() {
		rowDraggable = false;
		ondragend?.();
	}
</script>

<svelte:window onpointerup={() => (rowDraggable = false)} />

<div
	class="row"
	class:playing
	class:dragging
	class:drop-before={dropBefore}
	class:drop-after={dropAfter}
	draggable={rowDraggable}
	ondragstart={handleDragStart}
	ondragover={handleDragOver}
	ondrop={handleDrop}
	ondragend={handleDragEnd}
	role="listitem"
>
	<div class="header">
		<span
			class="grip"
			class:enabled={draggable}
			aria-hidden="true"
			onpointerdown={() => draggable && (rowDraggable = true)}
		>
			<Icon name="grip-vertical" />
		</span>

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

		<div class="body">
			{#if editing}
				<input
					class="text-input"
					type="text"
					bind:value={draft}
					use:focusInput
					onkeydown={onInputKey}
					onblur={commitEdit}
					aria-label="行テキスト"
				/>
			{:else}
				<button type="button" class="text" onclick={startEdit}>{line.text}</button>
			{/if}
			{#if line.mode === 'acting'}
				<EmotionChips script={line.script} />
			{/if}
		</div>

		<button
			type="button"
			class="badge"
			class:acting={line.mode === 'acting'}
			disabled={toggling}
			aria-label={line.mode === 'acting' ? 'アナウンサーに戻す' : '演技に分析'}
			onclick={() => ontoggle?.(line)}
		>
			{#if toggling}
				<Spinner size="0.9rem" />
			{:else}
				{line.mode === 'acting' ? '演技' : 'アナ'}
			{/if}
		</button>

		<button
			type="button"
			class="icon-btn"
			aria-label="行を削除"
			onclick={() => onrequestDelete?.(line)}
		>
			<Icon name="trash" />
		</button>
	</div>

	{#if expanded && line.mode === 'acting' && line.script}
		<div class="expansion">
			<!-- Remount (re-seed) only when a mode toggle bumps rev, not on autosave reloads. -->
			{#key rev}
				<EmotionEditor script={line.script} onsave={saveScript} />
			{/key}
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

	&.dragging
		opacity: 0.5

	// 2px accent insertion line at the drop position, centered in the row gap.
	&.drop-before::before,
	&.drop-after::after
		content: ''
		position: absolute
		left: 0
		right: 0
		height: 2px
		background: var(--c-accent)

	&.drop-before::before
		top: -5px

	&.drop-after::after
		bottom: -5px

.header
	display: flex
	align-items: center
	gap: var(--sp-2)

.grip
	display: flex
	align-items: center
	justify-content: center
	flex: none
	width: 18px
	color: var(--c-text-muted)
	cursor: default
	touch-action: none

	&.enabled
		cursor: grab

		&:active
			cursor: grabbing

	&:not(.enabled)
		opacity: 0.35

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

	// Display text: a full-width quiet button so it can enter inline edit on
	// click without adding chrome. Two lines max, ellipsized.
	.text
		display: -webkit-box
		width: 100%
		margin: 0
		padding: 0
		background: transparent
		border: none
		color: var(--c-text)
		font-family: inherit
		font-size: var(--fs-sm)
		line-height: 1.6
		text-align: left
		cursor: text
		-webkit-line-clamp: 2
		-webkit-box-orient: vertical
		overflow: hidden

	// Inline edit input: same box + typography as .text, swapped in place. The
	// negative margins offset padding so glyphs stay put; the 1px border is left
	// uncompensated so the element bounding box drifts at most 2px (padding 2px −
	// margin 2px + border 1px), keeping both glyph and box within the 2px budget.
	.text-input
		display: block
		width: 100%
		margin: -1px -2px
		padding: 0 2px
		background: var(--c-bg)
		border: 1px solid var(--c-accent)
		border-radius: var(--radius-sm)
		color: var(--c-text)
		font-family: inherit
		font-size: var(--fs-sm)
		line-height: 1.6

// Mode toggle: a real button that stays as quiet as an outline badge —
// affordance is cursor + hover wash only, no weight or fill change.
.badge
	display: inline-flex
	align-items: center
	justify-content: center
	flex: none
	min-width: 2.75rem
	min-height: 1.5rem
	padding: 1px var(--sp-2)
	border-radius: var(--radius-full)
	font-size: var(--fs-xs)
	color: var(--c-text-muted)
	background: transparent
	border: 1px solid var(--c-border)
	cursor: pointer

	&.acting
		color: var(--c-text-sub)

	&:hover
		background: var(--c-overlay-2)

	&:disabled
		cursor: wait

.icon-btn
	display: flex
	align-items: center
	justify-content: center
	flex: none
	width: 36px
	height: 36px
	padding: 0
	border: none
	border-radius: var(--radius-sm)
	background: transparent
	color: var(--c-text-sub)
	cursor: pointer

	&:hover
		color: var(--c-danger)

.expansion
	margin-top: var(--sp-3)
</style>
