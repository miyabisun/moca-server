<script>
	import ProjectList from '$lib/components/ProjectList.svelte';
	import LineWorkspace from '$lib/components/LineWorkspace.svelte';
	import PourInModal from '$lib/components/PourInModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import * as api from '$lib/api.js';
	import { play } from '$lib/player.svelte.js';
	import { addToast } from '$lib/toast.svelte.js';

	let projects = $state(null);
	let selectedId = $state(null);
	let selected = $state(null); // full project detail with lines
	let pourInOpen = $state(false);
	let confirm = $state(null); // { kind, target, busy }
	// Per-line editor revision. Bumped ONLY on reanalyze so the inline editor
	// remounts and re-seeds from the fresh server script; autosave reloads must
	// not bump it, or an open editor would reset mid-edit.
	let editorRev = $state({});

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

	async function saveLine(line, patch) {
		try {
			await api.updateLine(line.id, patch);
			await loadSelected();
		} catch (e) {
			addToast(`保存に失敗しました: ${e.message}`, 'danger');
		}
	}

	// --- Confirm-guarded actions ---
	function requestDeleteProject(project) {
		confirm = { kind: 'delete-project', target: project, busy: false };
	}
	function requestDeleteLine(line) {
		confirm = { kind: 'delete-line', target: line, busy: false };
	}
	function requestReanalyze(line) {
		confirm = { kind: 'reanalyze', target: line, busy: false };
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
			} else if (kind === 'reanalyze') {
				const script = await api.analyzeLine(target.text);
				await api.updateLine(target.id, { mode: 'acting', script });
				await loadSelected();
				// Force the (possibly open) inline editor to re-seed from the new script.
				editorRev = { ...editorRev, [target.id]: (editorRev[target.id] ?? 0) + 1 };
				addToast('再分析しました');
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
		reanalyze: {
			title: '再分析',
			message: '再分析すると、この行の手調整した感情パラメータは破棄されます。',
			confirmLabel: '再分析',
			danger: false
		}
	};

	async function onPourInDone() {
		await Promise.all([loadSelected(), loadProjects()]);
	}

	$effect(() => {
		loadProjects();
	});
</script>

<div class="layout">
	<aside class="list-pane">
		<ProjectList
			{projects}
			{selectedId}
			onselect={selectProject}
			oncreate={createProject}
			onrequestDelete={requestDeleteProject}
		/>
	</aside>
	<main class="detail-pane">
		{#if selected}
			<LineWorkspace
				project={selected}
				{editorRev}
				onrename={renameProject}
				{onplay}
				onsave={saveLine}
				onrequestDelete={requestDeleteLine}
				onrequestReanalyze={requestReanalyze}
				onpourin={() => (pourInOpen = true)}
			/>
		{:else}
			<div class="placeholder">プロジェクトを選択してください。</div>
		{/if}
	</main>
</div>

{#if pourInOpen && selected}
	<PourInModal
		projectId={selected.id}
		onclose={() => (pourInOpen = false)}
		ondone={onPourInDone}
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
.layout
	display: grid
	grid-template-columns: 1fr
	height: 100dvh

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

.placeholder
	display: flex
	align-items: center
	justify-content: center
	height: 100%
	color: var(--c-text-muted)
	font-size: var(--fs-sm)
</style>
