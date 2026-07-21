<script>
	import DictionaryEntryModal from '$lib/components/DictionaryEntryModal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TextEditModal from '$lib/components/TextEditModal.svelte';
	import * as api from '$lib/api.js';
	import { play, player } from '$lib/player.svelte.js';
	import { addToast } from '$lib/toast.svelte.js';

	let entries = $state(null);
	let cursorId = $state(null);
	let cursorColumn = $state('surface');
	let addOpen = $state(false);
	let editTarget = $state(null);
	let editCaret = $state(undefined);
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let lastKey = null;
	let lastKeyAt = 0;

	function fuzzyMatch(value, query) {
		const haystack = value.toLocaleLowerCase();
		const needle = query.trim().toLocaleLowerCase();
		let at = 0;
		for (const char of needle) {
			at = haystack.indexOf(char, at);
			if (at === -1) return false;
			at += char.length;
		}
		return true;
	}

	function matches(entry, query = searchQuery) {
		return fuzzyMatch(`${entry.surface} ${entry.reading}`, query);
	}

	let visibleEntries = $derived((entries ?? []).filter((entry) => matches(entry)));

	async function load() {
		try {
			entries = await api.listDict();
			return entries;
		} catch (e) {
			addToast(`辞書の読み込みに失敗しました: ${e.message}`, 'danger');
			return null;
		}
	}

	async function add(surface, reading) {
		try {
			const saved = await api.createDict(surface, reading);
			if (!matches(saved)) searchQuery = '';
			await load();
			cursorId = saved.id;
			cursorColumn = 'surface';
			scrollCursorIntoView();
		} catch (e) {
			addToast(`登録に失敗しました: ${e.message}`, 'danger');
			throw e;
		}
	}

	async function remove(entry) {
		const index = visibleEntries.findIndex((item) => item.id === entry.id);
		const nextId = visibleEntries[index + 1]?.id ?? visibleEntries[index - 1]?.id ?? null;
		try {
			await api.deleteDict(entry.id);
			cursorId = nextId;
			await load();
			scrollCursorIntoView();
		} catch (e) {
			addToast(`削除に失敗しました: ${e.message}`, 'danger');
		}
	}

	function preview(entry) {
		play({ id: `dict-${entry.id}`, mode: 'announcer', text: entry.reading, raw: true }).catch((e) =>
			addToast(`再生に失敗しました: ${e.message}`, 'danger')
		);
	}

	function focusedEntry() {
		return visibleEntries.find((entry) => entry.id === cursorId) ?? null;
	}

	function scrollCursorIntoView() {
		requestAnimationFrame(() => {
			document.querySelector('.dict tbody tr.focused')?.scrollIntoView({ block: 'nearest' });
		});
	}

	function moveCursor(direction) {
		const index = visibleEntries.findIndex((entry) => entry.id === cursorId);
		const next = index + direction;
		if (index === -1 || next < 0 || next >= visibleEntries.length) return;
		cursorId = visibleEntries[next].id;
		scrollCursorIntoView();
	}

	function openEdit(caret) {
		const entry = focusedEntry();
		if (!entry) return;
		editTarget = { ...entry, column: cursorColumn };
		editCaret = caret;
	}

	async function commitEdit(value) {
		const target = editTarget;
		if (!target) return;
		const surface = target.column === 'surface' ? value : target.surface;
		const reading = target.column === 'reading' ? value : target.reading;
		try {
			await api.updateDict(target.id, surface, reading);
			await load();
			cursorId = target.id;
			scrollCursorIntoView();
		} catch (e) {
			addToast(`更新に失敗しました: ${e.message}`, 'danger');
			// TextEditModal closes after invoking oncommit. Reopen it with the
			// attempted value so a conflict or network error never discards input.
			editTarget = { ...target, [target.column]: value };
			editCaret = undefined;
		}
	}

	function editableFocused() {
		const element = document.activeElement;
		return (
			element &&
			(element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)
		);
	}

	function onWindowKeydown(e) {
		if (e.isComposing || editableFocused() || addOpen || editTarget) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		const key = e.key;
		const now = Date.now();
		const previous = lastKey && now - lastKeyAt < 500 ? lastKey : null;
		lastKey = null;

		if (key === 'd') {
			e.preventDefault();
			if (previous === 'd') {
				const entry = focusedEntry();
				if (entry) remove(entry);
			} else {
				lastKey = key;
				lastKeyAt = now;
			}
			return;
		}

		switch (key) {
			case 'j':
				e.preventDefault();
				moveCursor(1);
				break;
			case 'k':
				e.preventDefault();
				moveCursor(-1);
				break;
			case 'h':
				e.preventDefault();
				cursorColumn = 'surface';
				break;
			case 'l':
				e.preventDefault();
				cursorColumn = 'reading';
				break;
			case 'o':
				e.preventDefault();
				addOpen = true;
				break;
			case 'a':
				e.preventDefault();
				openEdit('end');
				break;
			case 'i':
				e.preventDefault();
				openEdit('start');
				break;
			case ' ':
				e.preventDefault();
				if (focusedEntry()) preview(focusedEntry());
				break;
			case '/':
				e.preventDefault();
				searchOpen = true;
				break;
		}
	}

	function focusSearch(node) {
		node.focus();
	}

	$effect(() => {
		const list = visibleEntries;
		if (list.length === 0) cursorId = null;
		else if (!list.some((entry) => entry.id === cursorId)) cursorId = list[0].id;
	});

	$effect(() => {
		load();
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="dict">
	<div class="toolbar">
		{#if searchOpen}
			<div class="search">
				<Icon name="search" />
				<input
					bind:value={searchQuery}
					use:focusSearch
					aria-label="辞書を検索"
					placeholder="表記・読みを検索"
					onkeydown={(e) => {
						if (e.key === 'Escape') {
							e.preventDefault();
							e.currentTarget.blur();
							searchQuery = '';
							searchOpen = false;
						}
					}}
				/>
				<span>{visibleEntries.length}件</span>
			</div>
		{:else}
			<button type="button" class="quiet" onclick={() => (searchOpen = true)}>
				<Icon name="search" /> 検索 <kbd>/</kbd>
			</button>
		{/if}
		<button type="button" class="primary" onclick={() => (addOpen = true)}>
			<Icon name="plus" /> 項目を追加 <kbd>o</kbd>
		</button>
	</div>

	{#if entries == null}
		<p class="empty">読み込み中…</p>
	{:else if entries.length === 0}
		<p class="empty">まだ辞書に語句がありません。<kbd>o</kbd> で追加できます。</p>
	{:else if visibleEntries.length === 0}
		<p class="empty">「{searchQuery}」に一致する項目はありません。</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>表記</th>
					<th>読み</th>
					<th class="col-action">再生</th>
					<th class="col-action">削除</th>
				</tr>
			</thead>
			<tbody>
				{#each visibleEntries as entry (entry.id)}
					{@const focused = cursorId === entry.id}
					{@const playing = player.playingId === `dict-${entry.id}`}
					<tr class:focused onclick={() => (cursorId = entry.id)}>
						<td
							data-column="surface"
							class:cell-focused={focused && cursorColumn === 'surface'}
							onclick={() => (cursorColumn = 'surface')}>{entry.surface}</td
						>
						<td
							data-column="reading"
							class:cell-focused={focused && cursorColumn === 'reading'}
							onclick={() => (cursorColumn = 'reading')}>{entry.reading}</td
						>
						<td class="col-action">
							<button
								type="button"
								class="icon-btn"
								class:active={playing}
								aria-label={playing ? '停止' : '読みを再生'}
								onclick={() => preview(entry)}
							>
								<Icon name={playing ? 'stop' : 'play'} />
							</button>
						</td>
						<td class="col-action">
							<button
								type="button"
								class="icon-btn danger"
								aria-label="削除"
								onclick={() => remove(entry)}
							>
								<Icon name="trash" />
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

{#if addOpen}
	<DictionaryEntryModal onclose={() => (addOpen = false)} oncommit={add} />
{/if}

{#if editTarget}
	<TextEditModal
		text={editTarget[editTarget.column]}
		caret={editCaret}
		title={editTarget.column === 'surface' ? '表記を編集' : '読みを編集'}
		label={editTarget.column === 'surface' ? '表記を編集' : '読みを編集'}
		onclose={() => (editTarget = null)}
		oncommit={commitEdit}
	/>
{/if}

<style lang="sass">
.dict
	display: flex
	flex-direction: column
	height: 100%
	min-height: 0
	overflow: auto
	padding: var(--sp-4)

.toolbar
	position: sticky
	top: 0
	z-index: 2
	display: flex
	justify-content: space-between
	gap: var(--sp-2)
	padding-bottom: var(--sp-3)
	background: var(--c-bg)

	button
		display: inline-flex
		align-items: center
		gap: var(--sp-1)
		padding: var(--sp-2) var(--sp-3)
		border-radius: var(--radius-sm)
		font-size: var(--fs-sm)
		cursor: pointer

	.quiet
		border: 1px solid var(--c-border)
		background: var(--c-surface)
		color: var(--c-text-sub)

	.primary
		border: 1px solid var(--c-accent-strong)
		background: var(--c-accent-strong)
		color: var(--c-on-accent)

kbd
	padding: 0 var(--sp-1)
	border: 1px solid currentColor
	border-radius: 3px
	font-family: inherit
	font-size: var(--fs-xs)
	opacity: 0.7

.search
	display: flex
	align-items: center
	gap: var(--sp-2)
	width: min(32rem, 100%)
	padding: 0 var(--sp-3)
	border: 1px solid var(--c-accent-border)
	border-radius: var(--radius-sm)
	background: var(--c-surface)
	color: var(--c-text-sub)

	input
		flex: 1
		min-width: 0
		padding: var(--sp-2) 0
		border: none
		outline: none
		background: transparent
		color: var(--c-text)
		font: inherit
		font-size: var(--fs-sm)

	span
		white-space: nowrap
		font-size: var(--fs-xs)

.empty
	color: var(--c-text-muted)
	font-size: var(--fs-sm)

table
	width: 100%
	border-collapse: collapse
	font-size: var(--fs-sm)

	th
		padding: var(--sp-2) var(--sp-3)
		text-align: left
		font-size: var(--fs-xs)
		font-weight: 500
		color: var(--c-text-muted)
		border-bottom: 1px solid var(--c-border)

	td
		padding: var(--sp-2) var(--sp-3)
		color: var(--c-text)
		border-bottom: 1px solid var(--c-border)

	tr.focused
		background: var(--c-accent-bg)

	td.cell-focused
		box-shadow: inset 3px 0 var(--c-accent)

	.col-action
		width: 44px
		text-align: center

.icon-btn
	display: inline-flex
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

	&.active
		color: var(--c-accent)

	&.danger:hover
		color: var(--c-danger)

@media (max-width: 640px)
	.toolbar
		flex-wrap: wrap

	.search
		order: 2
		width: 100%
</style>
