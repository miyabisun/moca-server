<script>
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { importAnnouncer, importActing } from '$lib/api.js';
	import { addToast } from '$lib/toast.svelte.js';

	// Pour-in modal: large textarea + アナウンサー(default)/演技 segmented control.
	// 演技 mode shows per-line analyze progress over SSE; failed lines are noted
	// but never lost (saved as announcer server-side).
	let { projectId, onclose, ondone } = $props();

	let text = $state('');
	let mode = $state('announcer');
	let running = $state(false);
	let progress = $state(null); // { index, total }
	let failedCount = $state(0);

	let controller = null;

	function close() {
		controller?.abort();
		onclose?.();
	}

	async function confirm() {
		const body = text.trim();
		if (!body || running) return;
		running = true;
		failedCount = 0;
		try {
			if (mode === 'announcer') {
				const res = await importAnnouncer(projectId, body);
				addToast(`${res.created.length} 行を追加しました`);
			} else {
				controller = new AbortController();
				await importActing(projectId, body, {
					signal: controller.signal,
					onEvent: (e) => {
						progress = { index: e.index, total: e.total };
						if (e.status === 'failed') failedCount++;
					}
				});
				if (failedCount > 0) {
					addToast(`${failedCount} 行は分析に失敗しアナウンサー行として保存しました`, 'danger');
				} else {
					addToast('分析が完了しました');
				}
			}
			ondone?.();
			onclose?.();
		} catch (e) {
			if (e.name !== 'AbortError') addToast(`流し込みに失敗しました: ${e.message}`, 'danger');
		} finally {
			running = false;
		}
	}
</script>

<Modal title="台本追加" onclose={close} maxWidth="34rem" maxHeight="85dvh">
	<textarea bind:value={text} rows="10" placeholder="1行が1つの台本行になります" disabled={running}></textarea>

	<div class="modes">
		<button type="button" class:active={mode === 'announcer'} disabled={running} onclick={() => (mode = 'announcer')}>
			アナウンサー
		</button>
		<button type="button" class:active={mode === 'acting'} disabled={running} onclick={() => (mode = 'acting')}>
			演技
		</button>
	</div>
	<p class="hint">
		{#if mode === 'announcer'}
			感情なしのプレーンな読み上げ。速く、そのまま保存します。
		{:else}
			1行ずつ感情を分析します（1行あたり約10秒かかります）。
		{/if}
	</p>

	{#if running && mode === 'acting'}
		<p class="progress">
			<Spinner size="1rem" />
			{#if progress}{progress.index}/{progress.total} を分析中…{:else}分析を開始しています…{/if}
		</p>
		{#if failedCount > 0}
			<p class="failed">{failedCount} 行が失敗（アナウンサー行として保存）</p>
		{/if}
	{/if}

	<div class="actions">
		<button type="button" class="quiet" onclick={close}>閉じる</button>
		<button type="button" class="primary" disabled={running || !text.trim()} onclick={confirm}>
			{running ? '処理中…' : '追加'}
		</button>
	</div>
</Modal>

<style lang="sass">
textarea
	width: 100%
	padding: var(--sp-3)
	font-family: inherit
	font-size: var(--fs-md)
	color: var(--c-text)
	background: var(--c-bg)
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)
	resize: vertical

	&:focus
		border-color: var(--c-accent)

.modes
	display: flex
	gap: var(--sp-1)
	margin-top: var(--sp-3)
	padding: var(--sp-1)
	background: var(--c-bg)
	border: 1px solid var(--c-border)
	border-radius: var(--radius-sm)

	button
		flex: 1
		padding: var(--sp-2)
		background: transparent
		border: none
		border-radius: var(--radius-sm)
		color: var(--c-text-sub)
		font-size: var(--fs-sm)
		cursor: pointer

		&.active
			background: var(--c-accent-bg)
			color: var(--c-accent)

.hint
	margin: var(--sp-2) 0 0
	font-size: var(--fs-xs)
	color: var(--c-text-muted)

.progress
	display: flex
	align-items: center
	gap: var(--sp-2)
	margin: var(--sp-3) 0 0
	font-size: var(--fs-sm)
	color: var(--c-text-sub)

.failed
	margin: var(--sp-1) 0 0
	font-size: var(--fs-xs)
	color: var(--c-danger)

.actions
	display: flex
	justify-content: flex-end
	gap: var(--sp-2)
	margin-top: var(--sp-4)

	button
		padding: var(--sp-2) var(--sp-4)
		font-size: var(--fs-md)
		border-radius: var(--radius-sm)
		cursor: pointer

	.quiet
		background: transparent
		border: 1px solid var(--c-border)
		color: var(--c-text-sub)

	.primary
		background: var(--c-accent-strong)
		border: 1px solid var(--c-accent-strong)
		color: var(--c-on-accent)

		&:disabled
			opacity: 0.5
			cursor: not-allowed
</style>
