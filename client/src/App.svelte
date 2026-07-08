<script>
	import ProjectList from '$lib/components/ProjectList.svelte';
	import LineWorkspace from '$lib/components/LineWorkspace.svelte';
	import PourInModal from '$lib/components/PourInModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import LineContextMenu from '$lib/components/LineContextMenu.svelte';
	import TextEditModal from '$lib/components/TextEditModal.svelte';
	import DictionaryView from '$lib/components/DictionaryView.svelte';
	import NotifySubscribe from '$lib/components/NotifySubscribe.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import * as api from '$lib/api.js';
	import { play, playAll, stop, player } from '$lib/player.svelte.js';
	import { addToast } from '$lib/toast.svelte.js';

	let projects = $state(null);
	let selectedId = $state(null);
	let selected = $state(null); // full project detail with lines
	// Which top-level view is active. 台本 = two-pane workspace, 辞書 = dictionary.
	let activeTab = $state('script');
	// Pour-in modal state. `afterLineId` inserts after that line; null = append end.
	let pourIn = $state(false);
	let pourInAfter = $state(null);
	let confirm = $state(null); // { kind, target, busy }
	// Line context menu / text edit targets (null = closed).
	let menuLine = $state(null);
	let textEditLine = $state(null);
	// Per-line editor revision. Bumped ONLY when a mode toggle re-seeds a script so
	// the inline editor remounts from the fresh server script; autosave reloads
	// must not bump it, or an open editor would reset mid-edit.
	let editorRev = $state({});
	// Per-line busy flag for the アナ→演技 toggle (analysis is ~10s; blocks re-taps).
	let toggleBusy = $state({});

	async function loadProjects() {
		projects = await api.listProjects();
	}

	async function loadSelected() {
		if (selectedId == null) {
			selected = null;
			return;
		}
		selected = await api.getProject(selectedId);
	}

	async function selectProject(id) {
		selectedId = id;
		await loadSelected();
	}

	async function createProject(name) {
		try {
			const p = await api.createProject(name);
			await loadProjects();
			await selectProject(p.id);
		} catch (e) {
			addToast(`作成に失敗しました: ${e.message}`, 'danger');
		}
	}

	async function renameProject(name) {
		try {
			await api.renameProject(selectedId, name);
			await Promise.all([loadProjects(), loadSelected()]);
		} catch (e) {
			addToast(`改名に失敗しました: ${e.message}`, 'danger');
		}
	}

	function onplay(line) {
		play(line).catch((e) => addToast(`再生に失敗しました: ${e.message}`, 'danger'));
	}

	// Whole-project listen-through (radio). Tapping the active project stops it.
	async function onPlayAll(projectId) {
		if (player.radioProjectId === projectId) {
			stop();
			return;
		}
		try {
			const lines =
				selectedId === projectId && selected
					? selected.lines
					: (await api.getProject(projectId)).lines;
			playAll(projectId, lines);
		} catch (e) {
			addToast(`再生に失敗しました: ${e.message}`, 'danger');
		}
	}

	async function saveLine(line, patch) {
		try {
			await api.updateLine(line.id, patch);
			await loadSelected();
		} catch (e) {
			addToast(`保存に失敗しました: ${e.message}`, 'danger');
		}
	}

	async function reorderLines(order) {
		try {
			await api.reorderLines(selectedId, order);
			await loadSelected();
		} catch (e) {
			addToast(`並び替えに失敗しました: ${e.message}`, 'danger');
		}
	}

	// Mode toggle (the badge). アナ→演技 runs /analyze inline; 演技→アナ is
	// destructive (discards hand-tuned JSON) and routes through ConfirmModal.
	async function toggleMode(line) {
		if (line.mode === 'acting') {
			confirm = { kind: 'to-announcer', target: line, busy: false };
			return;
		}
		if (toggleBusy[line.id]) return; // analysis already running
		toggleBusy = { ...toggleBusy, [line.id]: true };
		try {
			const script = await api.analyzeLine(line.text);
			await api.updateLine(line.id, { mode: 'acting', script });
			await loadSelected();
			editorRev = { ...editorRev, [line.id]: (editorRev[line.id] ?? 0) + 1 };
		} catch (e) {
			addToast(`分析に失敗しました: ${e.message}`, 'danger');
		} finally {
			toggleBusy = { ...toggleBusy, [line.id]: false };
		}
	}

	// --- Confirm-guarded actions ---
	function requestDeleteProject(project) {
		confirm = { kind: 'delete-project', target: project, busy: false };
	}
	function requestDeleteLine(line) {
		confirm = { kind: 'delete-line', target: line, busy: false };
	}

	async function runConfirm() {
		if (!confirm) return;
		confirm = { ...confirm, busy: true };
		const { kind, target } = confirm;
		try {
			if (kind === 'delete-project') {
				await api.deleteProject(target.id);
				if (selectedId === target.id) {
					selectedId = null;
					selected = null;
				}
				await loadProjects();
			} else if (kind === 'delete-line') {
				await api.deleteLine(target.id);
				await loadSelected();
			} else if (kind === 'to-announcer') {
				await api.updateLine(target.id, { mode: 'announcer', script: null });
				await loadSelected();
			}
		} catch (e) {
			addToast(`失敗しました: ${e.message}`, 'danger');
		} finally {
			confirm = null;
		}
	}

	const confirmText = {
		'delete-project': {
			title: 'プロジェクトを削除',
			message: 'このプロジェクトと全ての行を削除します。元に戻せません。',
			confirmLabel: '削除',
			danger: true
		},
		'delete-line': {
			title: '行を削除',
			message: 'この行を削除します。元に戻せません。',
			confirmLabel: '削除',
			danger: true
		},
		'to-announcer': {
			title: '演技を解除',
			message: '手調整した感情パラメータを破棄してアナウンサーに戻します。元に戻せません。',
			confirmLabel: '解除',
			danger: true
		}
	};

	// Pour-in from the footer: append at the end (no afterLineId).
	function openPourIn() {
		pourInAfter = null;
		pourIn = true;
	}

	async function onPourInDone() {
		await Promise.all([loadSelected(), loadProjects()]);
	}

	// --- Line context menu (right-click / long-press) and its actions ---
	function openLineMenu(line) {
		menuLine = line;
	}

	// 台本追加 (menu): open pour-in inserting directly after this line.
	function menuAddAfter(line) {
		pourInAfter = line.id;
		pourIn = true;
	}

	async function commitTextEdit(text) {
		if (!textEditLine) return;
		await saveLine(textEditLine, { text });
	}

	async function duplicateLine(line) {
		try {
			await api.duplicateLine(line.id);
			await loadSelected();
		} catch (e) {
			addToast(`複製に失敗しました: ${e.message}`, 'danger');
		}
	}

	$effect(() => {
		loadProjects();
	});
</script>

<div class="app">
	<header class="app-header">
		<span class="site-title">宮舞モカ 台本工房</span>
		<nav class="tabs">
			<button type="button" class:active={activeTab === 'script'} onclick={() => (activeTab = 'script')}>
				台本
			</button>
			<button type="button" class:active={activeTab === 'dict'} onclick={() => (activeTab = 'dict')}>
				辞書
			</button>
		</nav>
		<NotifySubscribe />
	</header>

	{#if activeTab === 'script'}
		<div class="layout">
			<aside class="list-pane">
				<ProjectList
					{projects}
					{selectedId}
					radioProjectId={player.radioProjectId}
					onselect={selectProject}
					oncreate={createProject}
					onplayall={onPlayAll}
					onrequestDelete={requestDeleteProject}
				/>
			</aside>
			<main class="detail-pane">
				{#if selected}
					<LineWorkspace
						project={selected}
						{editorRev}
						{toggleBusy}
						onrename={renameProject}
						{onplay}
						onsave={saveLine}
						onreorder={reorderLines}
						ontoggle={toggleMode}
						onrequestDelete={requestDeleteLine}
						onmenu={openLineMenu}
						onpourin={openPourIn}
					/>
				{:else}
					<div class="placeholder">プロジェクトを選択してください。</div>
				{/if}
			</main>
		</div>
	{:else}
		<main class="dict-view">
			<DictionaryView />
		</main>
	{/if}
</div>

{#if pourIn && selected}
	<PourInModal
		projectId={selected.id}
		afterLineId={pourInAfter}
		onclose={() => {
			pourIn = false;
			pourInAfter = null;
		}}
		ondone={onPourInDone}
	/>
{/if}

{#if menuLine}
	{@const line = menuLine}
	<LineContextMenu
		onclose={() => (menuLine = null)}
		onadd={() => menuAddAfter(line)}
		onedit={() => (textEditLine = line)}
		onduplicate={() => duplicateLine(line)}
	/>
{/if}

{#if textEditLine}
	<TextEditModal
		text={textEditLine.text}
		onclose={() => (textEditLine = null)}
		oncommit={commitTextEdit}
	/>
{/if}

{#if confirm}
	{@const t = confirmText[confirm.kind]}
	<ConfirmModal
		title={t.title}
		message={t.message}
		confirmLabel={t.confirmLabel}
		danger={t.danger}
		busy={confirm.busy}
		onconfirm={runConfirm}
		oncancel={() => (confirm = null)}
	/>
{/if}

<Toast />

<style lang="sass">
.app
	display: grid
	grid-template-rows: auto 1fr
	height: 100dvh

// A thin surface-raised band with the site title and the app's only navigation:
// the 台本 / 辞書 tabs. No actions, no shadow.
.app-header
	display: flex
	align-items: center
	gap: var(--sp-5)
	padding: var(--sp-2) var(--sp-4)
	background: var(--c-surface)
	border-bottom: 1px solid var(--c-border)

.site-title
	font-size: var(--fs-md)
	font-weight: 500
	color: var(--c-text-muted)

// Sumi tab recipe: label-type, muted when inactive; active adds on-surface text
// and a 2px accent underline — no background change.
.tabs
	display: flex
	gap: var(--sp-4)

	button
		padding: var(--sp-1) 0
		background: transparent
		border: none
		border-bottom: 2px solid transparent
		color: var(--c-text-sub)
		font-family: inherit
		font-size: var(--fs-sm)
		cursor: pointer

		&:hover
			color: var(--c-text)

		&.active
			color: var(--c-text)
			border-bottom-color: var(--c-accent)

.layout
	display: grid
	grid-template-columns: 1fr
	min-height: 0

	@media (min-width: 768px)
		grid-template-columns: 20rem 1fr

.list-pane
	overflow: auto
	border-right: 1px solid var(--c-border)

	@media (max-width: 767px)
		border-right: none
		border-bottom: 1px solid var(--c-border)

.detail-pane
	min-height: 0
	overflow: hidden

.dict-view
	min-height: 0
	overflow: hidden

.placeholder
	display: flex
	align-items: center
	justify-content: center
	height: 100%
	color: var(--c-text-muted)
	font-size: var(--fs-sm)
</style>
