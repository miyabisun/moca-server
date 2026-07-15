<script>
	import WorkScene from '$lib/components/WorkScene.svelte';
	import WorkPortrait from '$lib/components/WorkPortrait.svelte';
	import WorkTimerPanel from '$lib/components/WorkTimerPanel.svelte';

	// 作業タブのルート。レイヤー合成だけを担い、ロジックは持たない。
	// 画面全体が「モカのノート PC カメラの映像」という体なので、奥から
	// WorkScene (部屋の中) → WorkPortrait (バストアップのモカ) →
	// ビデオ通話らしい薄いクローム (通話中バッジ・ビネット) → タイマー盤。
	// 立ち絵は素材未配置なら自分で消えるので、ここでは並べるだけでよい。
</script>

<div class="work-stage">
	<WorkScene />
	<div class="portrait-slot">
		<WorkPortrait />
	</div>
	<div class="cam-chrome">
		<span class="live"><span class="dot"></span>通話中</span>
	</div>
	<div class="panel-slot">
		<WorkTimerPanel />
	</div>
</div>

<style lang="sass">
.work-stage
	position: relative
	height: 100%
	min-height: 0
	overflow: hidden

// カメラの被写体。モカのバストアップ (リボン下端まで) を中央やや右、下端に接地。
// カメラに寄っている想定なので大きめに写す
.portrait-slot
	position: absolute
	bottom: 0
	left: 54%
	transform: translateX(-50%)
	height: 88%
	display: flex
	align-items: flex-end
	justify-content: center

	@media (max-width: 767px)
		left: 68%
		height: 70%

// ビデオ通話らしさの薄皮: 周辺減光と「通話中」バッジ。操作は透過する
.cam-chrome
	position: absolute
	inset: 0
	pointer-events: none
	box-shadow: inset 0 0 110px rgba(0, 0, 0, 0.35)

	.live
		position: absolute
		top: var(--sp-3)
		left: var(--sp-3)
		display: inline-flex
		align-items: center
		gap: var(--sp-1)
		padding: 2px var(--sp-2)
		border-radius: var(--radius-full)
		background: rgba(0, 0, 0, 0.35)
		color: rgba(255, 255, 255, 0.85)
		font-size: var(--fs-xs)

	.dot
		width: 7px
		height: 7px
		border-radius: var(--radius-full)
		background: #4dd6a1

// タイマー盤は薄いガラス面に載せて、演出の上でも読めるようにする
.panel-slot
	position: absolute
	left: clamp(var(--sp-4), 6%, 96px)
	top: 50%
	transform: translateY(-50%)
	background: color-mix(in srgb, var(--c-bg) 72%, transparent)
	backdrop-filter: blur(6px)
	border: 1px solid var(--c-border)
	border-radius: var(--radius-lg)

	@media (max-width: 767px)
		left: 50%
		transform: translate(-50%, -50%)
		background: color-mix(in srgb, var(--c-bg) 82%, transparent)
</style>
