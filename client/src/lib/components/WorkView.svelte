<script>
	import WorkScene from '$lib/components/WorkScene.svelte';
	import WorkPortrait from '$lib/components/WorkPortrait.svelte';
	import WorkTimerPanel from '$lib/components/WorkTimerPanel.svelte';

	// 作業タブのルート。レイヤー合成だけを担い、ロジックは持たない:
	// 奥から WorkScene (窓辺の演出) → WorkPortrait (立ち絵) → タイマー盤。
	// 立ち絵は素材未配置なら自分で消えるので、ここでは並べるだけでよい。
</script>

<div class="work-stage">
	<WorkScene />
	<div class="portrait-slot">
		<WorkPortrait />
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

.portrait-slot
	position: absolute
	right: 6%
	bottom: 0
	top: 6%
	display: flex
	align-items: flex-end

	@media (max-width: 767px)
		// 狭い画面ではタイマー盤を優先し、立ち絵は右へ逃がして顔だけ覗かせる
		right: -30%

// タイマー盤は薄いガラス面に載せて、演出の上でも読めるようにする
.panel-slot
	position: absolute
	left: clamp(var(--sp-4), 8%, 120px)
	top: 50%
	transform: translateY(-50%)
	background: color-mix(in srgb, var(--c-bg) 72%, transparent)
	backdrop-filter: blur(6px)
	border: 1px solid var(--c-border)
	border-radius: var(--radius-lg)

	@media (max-width: 767px)
		left: 50%
		transform: translate(-50%, -50%)
</style>
