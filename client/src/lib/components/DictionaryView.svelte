<script>
	import Icon from '$lib/components/Icon.svelte';
	import * as api from '$lib/api.js';
	import { play, player } from '$lib/player.svelte.js';
	import { addToast } from '$lib/toast.svelte.js';

	// Reading dictionary: a single dense table (surface / reading / play / delete)
	// with an add form above it. The per-row play button speaks the reading via
	// /say for an instant ear check. This dictionary rewrites sound, not text.
	let entries = $state(null);
	let surface = $state('');
	let reading = $state('');
	let saving = $state(false);

	async function load() {
		try {
			entries = await api.listDict();
		} catch (e) {
			addToast(`辞書の読み込みに失敗しました: ${e.message}`, 'danger');
		}
	}

	async function add() {
		const s = surface.trim();
		const r = reading.trim();
		if (!s || !r || saving) return;
		saving = true;
		try {
			await api.createDict(s, r);
			surface = '';
			reading = '';
			await load();
		} catch (e) {
			addToast(`登録に失敗しました: ${e.message}`, 'danger');
		} finally {
			saving = false;
		}
	}

	async function remove(entry) {
		try {
			await api.deleteDict(entry.id);
			await load();
		} catch (e) {
			addToast(`削除に失敗しました: ${e.message}`, 'danger');
		}
	}

	// Preview the reading through /say (announcer path). A distinct id namespace
	// keeps the play/stop toggle from colliding with line-row playback ids.
	function preview(entry) {
		play({ id: `dict-${entry.id}`, mode: 'announcer', text: entry.reading, raw: true }).catch((e) =>
			addToast(`再生に失敗しました: ${e.message}`, 'danger')
		);
	}

	$effect(() => {
		load();
	});
</script>

<div class="dict">
	<form
		class="add"
		onsubmit={(e) => {
			e.preventDefault();
			add();
		}}
	>
		<input bind:value={surface} placeholder="表記（例: GPU）" aria-label="表記" />
		<input bind:value={reading} placeholder="読み（例: ジーピーユー）" aria-label="読み" />
		<button type="submit" class="primary" disabled={saving || !surface.trim() || !reading.trim()}>
			<Icon name="plus" /> 追加
		</button>
	</form>

	{#if entries == null}
		<p class="empty">読み込み中…</p>
	{:else if entries.length === 0}
		<p class="empty">まだ辞書に語句がありません。上のフォームから追加できます。</p>
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
				{#each entries as entry (entry.id)}
					{@const playing = player.playingId === `dict-${entry.id}`}
					<tr>
						<td>{entry.surface}</td>
						<td>{entry.reading}</td>
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

<style lang="sass">
.dict
	display: flex
	flex-direction: column
	gap: var(--sp-4)
	height: 100%
	min-height: 0
	overflow: auto
	padding: var(--sp-4)

.add
	display: flex
	gap: var(--sp-2)
	align-items: center

	input
		flex: 1
		min-width: 0
		padding: var(--sp-2) var(--sp-3)
		font-family: inherit
		font-size: var(--fs-sm)
		color: var(--c-text)
		background: var(--c-bg)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)

		&:focus
			border-color: var(--c-accent)

	.primary
		display: inline-flex
		align-items: center
		gap: var(--sp-1)
		flex: none
		padding: var(--sp-2) var(--sp-4)
		background: var(--c-accent-strong)
		border: 1px solid var(--c-accent-strong)
		border-radius: var(--radius-sm)
		color: var(--c-on-accent)
		font-size: var(--fs-sm)
		cursor: pointer

		&:disabled
			opacity: 0.5
			cursor: not-allowed

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
</style>
