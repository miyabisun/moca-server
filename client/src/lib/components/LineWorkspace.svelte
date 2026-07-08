<script>
	import LineRow from '$lib/components/LineRow.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { player } from '$lib/player.svelte.js';

	// Detail pane: the line workspace. A scrolling column of line rows in
	// narration order, plus a sticky footer whose primary action is pour-in.
	let {
		project,
		editorRev = {},
		onrename,
		onplay,
		onsave,
		onrequestDelete,
		onrequestReanalyze,
		onpourin
	} = $props();

	let editingName = $state(false);
	let draftName = $state('');

	function startRename() {
		draftName = project.name;
		editingName = true;
	}

	function commitRename() {
		const name = draftName.trim();
		if (name && name !== project.name) onrename?.(name);
		editingName = false;
	}
</script>

<div class="pane">
	<div class="pane-head">
		{#if editingName}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					commitRename();
				}}
			>
				<!-- svelte-ignore a11y_autofocus -->
				<input bind:value={draftName} onblur={commitRename} autofocus />
			</form>
		{:else}
			<button type="button" class="title-btn" onclick={startRename} title="クリックで改名">
				{project.name}
			</button>
		{/if}
		<span class="count">{project.lines.length} 行</span>
	</div>

	<div class="lines">
		{#if project.lines.length === 0}
			<p class="empty">まだ行がありません。下のボタンからテキストを流し込みましょう。</p>
		{:else}
			{#each project.lines as line (line.id)}
				<LineRow
					{line}
					rev={editorRev[line.id] ?? 0}
					playing={player.playingId === line.id}
					loading={player.loadingId === line.id}
					spinner={player.spinnerId === line.id}
					{onplay}
					{onsave}
					{onrequestDelete}
					{onrequestReanalyze}
				/>
			{/each}
		{/if}
	</div>

	<div class="footer">
		<button type="button" class="primary" onclick={onpourin}>
			<Icon name="plus" /> テキストを流し込む
		</button>
	</div>
</div>

<style lang="sass">
.pane
	display: flex
	flex-direction: column
	height: 100%
	min-height: 0

.pane-head
	display: flex
	align-items: baseline
	gap: var(--sp-3)
	padding: var(--sp-3)
	border-bottom: 1px solid var(--c-border)

	.title-btn
		margin: 0
		padding: 0
		background: transparent
		border: none
		color: var(--c-text)
		font-size: var(--fs-xl)
		font-weight: 600
		text-align: left
		cursor: text

	input
		font-family: inherit
		font-size: var(--fs-xl)
		font-weight: 600
		color: var(--c-text)
		background: var(--c-bg)
		border: 1px solid var(--c-accent)
		border-radius: var(--radius-sm)
		padding: 2px var(--sp-2)

	.count
		font-size: var(--fs-xs)
		color: var(--c-text-muted)

.lines
	flex: 1
	min-height: 0
	overflow: auto
	display: flex
	flex-direction: column
	gap: var(--sp-2)
	padding: var(--sp-3)

.empty
	color: var(--c-text-muted)
	font-size: var(--fs-sm)

.footer
	position: sticky
	bottom: 0
	padding: var(--sp-3)
	border-top: 1px solid var(--c-border)
	background: var(--c-bg)

.primary
	display: inline-flex
	align-items: center
	gap: var(--sp-1)
	padding: var(--sp-2) var(--sp-4)
	background: var(--c-accent)
	border: 1px solid var(--c-accent)
	border-radius: var(--radius-sm)
	color: var(--c-on-accent)
	font-size: var(--fs-md)
	cursor: pointer
</style>
