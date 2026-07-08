<script>
	import Icon from '$lib/components/Icon.svelte';

	// List pane: project cards (name + line count + updated-at) and the one
	// primary button, 新規プロジェクト.
	let { projects, selectedId, onselect, oncreate, onrequestDelete } = $props();

	let creating = $state(false);
	let draftName = $state('');

	function submitNew() {
		const name = draftName.trim();
		if (!name) return;
		oncreate?.(name);
		draftName = '';
		creating = false;
	}

	function fmt(iso) {
		const d = new Date(iso);
		if (isNaN(d)) return '';
		const p = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}
</script>

<div class="pane">
	<div class="pane-head">
		<h1>プロジェクト</h1>
		<button
			type="button"
			class:primary={!creating}
			class:quiet={creating}
			onclick={() => (creating = !creating)}
		>
			{#if creating}
				<Icon name="x" /> 閉じる
			{:else}
				<Icon name="plus" /> 新規
			{/if}
		</button>
	</div>

	{#if creating}
		<form
			class="new-form"
			onsubmit={(e) => {
				e.preventDefault();
				submitNew();
			}}
		>
			<!-- svelte-ignore a11y_autofocus -->
			<input bind:value={draftName} placeholder="プロジェクト名" autofocus />
			<button type="submit" class="primary">作成</button>
		</form>
	{/if}

	{#if projects == null}
		<p class="empty">読み込み中…</p>
	{:else if projects.length === 0}
		<p class="empty">まだプロジェクトがありません。</p>
	{:else}
		<ul class="list">
			{#each projects as p (p.id)}
				<li class="card" class:selected={p.id === selectedId}>
					<button type="button" class="select" onclick={() => onselect?.(p.id)}>
						<span class="name">{p.name}</span>
						<span class="meta">{p.lineCount ?? 0} 行 · {fmt(p.updated_at)}</span>
					</button>
					<button
						type="button"
						class="icon-btn"
						aria-label="プロジェクトを削除"
						onclick={() => onrequestDelete?.(p)}
					>
						<Icon name="trash" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="sass">
.pane
	display: flex
	flex-direction: column
	gap: var(--sp-3)
	padding: var(--sp-3)

.pane-head
	display: flex
	align-items: center
	justify-content: space-between

	h1
		margin: 0
		font-size: var(--fs-xl)
		font-weight: 600

.primary
	display: inline-flex
	align-items: center
	gap: var(--sp-1)
	padding: var(--sp-2) var(--sp-3)
	background: var(--c-accent)
	border: 1px solid var(--c-accent)
	border-radius: var(--radius-sm)
	color: var(--c-on-accent)
	font-size: var(--fs-sm)
	cursor: pointer

.quiet
	display: inline-flex
	align-items: center
	gap: var(--sp-1)
	padding: var(--sp-2) var(--sp-3)
	background: transparent
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)
	color: var(--c-text)
	font-size: var(--fs-sm)
	cursor: pointer

.new-form
	display: flex
	gap: var(--sp-2)

	input
		flex: 1
		padding: var(--sp-2)
		font-family: inherit
		font-size: var(--fs-sm)
		color: var(--c-text)
		background: var(--c-bg)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)

		&:focus
			border-color: var(--c-accent)

.empty
	color: var(--c-text-muted)
	font-size: var(--fs-sm)

.list
	display: flex
	flex-direction: column
	gap: var(--sp-2)

.card
	display: flex
	align-items: center
	gap: var(--sp-2)
	border-radius: var(--radius-md)
	background: var(--c-surface)
	border: 1px solid var(--c-border)

	&:hover
		background: var(--c-overlay-1)

	&.selected
		border-color: var(--c-accent-border)

.select
	flex: 1
	min-width: 0
	display: flex
	flex-direction: column
	align-items: flex-start
	gap: 2px
	padding: var(--sp-3)
	background: transparent
	border: none
	color: var(--c-text)
	text-align: left
	cursor: pointer

	.name
		max-width: 100%
		font-size: var(--fs-md)
		font-weight: 500
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap

	.meta
		font-size: var(--fs-xs)
		color: var(--c-text-muted)

.icon-btn
	display: flex
	align-items: center
	justify-content: center
	flex: none
	width: 32px
	height: 32px
	margin-right: var(--sp-2)
	padding: 0
	border: none
	border-radius: var(--radius-sm)
	background: transparent
	color: var(--c-text-sub)
	cursor: pointer

	&:hover
		color: var(--c-danger)
</style>
