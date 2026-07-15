<script>
	import { timer, start, pause, reset, updateSettings } from '$lib/work/timer.svelte.js';
	import { voice, toggle as toggleVoice, setChatter } from '$lib/work/voice.svelte.js';

	// ポモドーロの操作盤。状態はすべて timer / voice モジュールが持ち、この
	// コンポーネントは表示専用 — タブを離れて destroy されてもタイマーは進む。
	const PHASE_LABEL = { idle: '待機', work: '作業中', break: '休憩中' };

	// SVG リングの進捗。idle は満円のまま置いておく。
	const R = 88;
	const CIRC = 2 * Math.PI * R;
	let progress = $derived(
		timer.phaseTotalMs > 0 ? timer.remainingMs / timer.phaseTotalMs : 1
	);

	let display = $derived(
		timer.phase === 'idle' ? timer.settings.workMin * 60_000 : timer.remainingMs
	);

	function fmt(ms) {
		const s = Math.max(0, Math.ceil(ms / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	// 設定は次のフェーズから効く。input は即時 commit (フォーム不要の軽さ優先)。
	function setNum(key, value) {
		updateSettings({ [key]: value });
	}
</script>

<section class="panel" data-phase={timer.phase} aria-label="ポモドーロタイマー">
	<div class="dial">
		<svg viewBox="0 0 200 200" role="img" aria-label="残り時間リング">
			<circle class="track" cx="100" cy="100" r={R} />
			<circle
				class="arc"
				cx="100"
				cy="100"
				r={R}
				stroke-dasharray={CIRC}
				stroke-dashoffset={CIRC * (1 - progress)}
			/>
		</svg>
		<div class="readout">
			<span class="phase-label">{timer.asking ? 'どうする?' : PHASE_LABEL[timer.phase]}</span>
			<span class="time">{fmt(display)}</span>
		</div>
	</div>

	<div class="controls">
		{#if timer.running}
			<button type="button" class="primary" onclick={pause}>一時停止</button>
		{:else}
			<button type="button" class="primary" onclick={start}>
				{timer.asking ? 'もう1セット' : timer.phase === 'idle' ? '開始' : '再開'}
			</button>
		{/if}
		<button
			type="button"
			class="quiet"
			onclick={reset}
			disabled={timer.phase === 'idle' && !timer.asking}
		>
			終了
		</button>
		<button
			type="button"
			class="quiet voice"
			class:on={voice.enabled}
			aria-pressed={voice.enabled}
			onclick={toggleVoice}
		>
			声かけ {voice.enabled ? 'ON' : 'OFF'}
		</button>
	</div>

	<div class="settings">
		<label>
			作業
			<input
				type="number"
				min="1"
				max="180"
				value={timer.settings.workMin}
				onchange={(e) => setNum('workMin', e.currentTarget.value)}
			/>
			分
		</label>
		<label>
			休憩
			<input
				type="number"
				min="1"
				max="60"
				value={timer.settings.breakMin}
				onchange={(e) => setNum('breakMin', e.currentTarget.value)}
			/>
			分
		</label>
		<label>
			おしゃべり
			<select value={voice.chatter} onchange={(e) => setChatter(e.currentTarget.value)}>
				<option value="normal">ふつう</option>
				<option value="sparse">ひかえめ</option>
				<option value="off">なし</option>
			</select>
		</label>
	</div>
</section>

<style lang="sass">
.panel
	display: flex
	flex-direction: column
	align-items: center
	gap: var(--sp-4)
	padding: var(--sp-5)

.dial
	position: relative
	width: 240px
	height: 240px

	svg
		width: 100%
		height: 100%
		transform: rotate(-90deg)

	.track
		fill: none
		stroke: var(--c-border)
		stroke-width: 6

	// リングは常にモカアクセント (secondary は「alive 状態」専用 — DESIGN.md —
	// なので休憩の色分けには使わない。フェーズはラベルで示す)。1s tick なので
	// transition は linear 1s で滑らかに減る。
	.arc
		fill: none
		stroke: var(--c-accent)
		stroke-width: 6
		stroke-linecap: round
		transition: stroke-dashoffset 1s linear, stroke 0.3s ease

.readout
	position: absolute
	inset: 0
	display: flex
	flex-direction: column
	align-items: center
	justify-content: center
	gap: var(--sp-1)

.phase-label
	font-size: var(--fs-sm)
	color: var(--c-text-sub)

.time
	font-size: 44px
	font-weight: 300
	font-variant-numeric: tabular-nums
	color: var(--c-text)
	line-height: 1.1

.controls
	display: flex
	gap: var(--sp-2)

	.primary
		padding: var(--sp-2) var(--sp-5)
		background: var(--c-accent-strong)
		border: 1px solid var(--c-accent-strong)
		border-radius: var(--radius-sm)
		color: var(--c-on-accent)
		font-size: var(--fs-sm)
		cursor: pointer

	.quiet
		padding: var(--sp-2) var(--sp-4)
		background: transparent
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)
		color: var(--c-text-sub)
		font-size: var(--fs-sm)
		cursor: pointer

		&:hover
			color: var(--c-text)

		&:disabled
			opacity: 0.5
			cursor: not-allowed

	.voice.on
		color: var(--c-secondary)
		border-color: var(--c-secondary)

.settings
	display: flex
	gap: var(--sp-4)
	font-size: var(--fs-sm)
	color: var(--c-text-sub)

	label
		display: inline-flex
		align-items: center
		gap: var(--sp-1)

	// スピナーは両エンジンとも消す。Firefox は矢印が値の右側を覆って数字が
	// 読めなくなるため (値の増減はキーボード/直接入力で足りる)。
	input
		width: 3.5em
		padding: var(--sp-1) var(--sp-2)
		font-family: inherit
		font-size: var(--fs-sm)
		text-align: right
		color: var(--c-text)
		background: var(--c-bg)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)
		appearance: textfield

		&::-webkit-outer-spin-button,
		&::-webkit-inner-spin-button
			-webkit-appearance: none
			margin: 0

		&:focus
			border-color: var(--c-accent)

	select
		padding: var(--sp-1) var(--sp-2)
		font-family: inherit
		font-size: var(--fs-sm)
		color: var(--c-text)
		background: var(--c-bg)
		border: 1px solid var(--c-border)
		border-radius: var(--radius-sm)

		&:focus
			border-color: var(--c-accent)
</style>
