<script>
	// 背景演出 (純 CSS/SVG、ロジックなし — タイマーや音声には一切触れない)。
	// 時間帯 4 種 (dawn 5-8 / day 8-16 / dusk 16-19 / night 19-5) で窓の外の空が
	// 変わる。空のグラデーションは 4 層を重ねて opacity クロスフェード
	// (グラデーション自体は transition できないため)。
	let hour = $state(new Date().getHours());

	$effect(() => {
		const iv = setInterval(() => (hour = new Date().getHours()), 60_000);
		return () => clearInterval(iv);
	});

	let band = $derived(
		hour >= 5 && hour < 8
			? 'dawn'
			: hour >= 8 && hour < 16
				? 'day'
				: hour >= 16 && hour < 19
					? 'dusk'
					: 'night' // 19時〜翌4時
	);
</script>

<div class="scene" data-band={band} aria-hidden="true">
	<div class="sky dawn"></div>
	<div class="sky day"></div>
	<div class="sky dusk"></div>
	<div class="sky night"></div>

	<!-- 窓の外の遠景: 丘のシルエット + 夜だけ灯る街明かり -->
	<svg class="far" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice">
		<path
			class="hill back"
			d="M0 460 Q 180 380 360 440 T 700 430 T 1000 450 L 1000 600 L 0 600 Z"
		/>
		<path
			class="hill front"
			d="M0 510 Q 220 450 430 500 T 780 495 T 1000 510 L 1000 600 L 0 600 Z"
		/>
		<g class="town">
			<circle cx="240" cy="500" r="3" />
			<circle cx="300" cy="512" r="2.5" />
			<circle cx="352" cy="505" r="2" />
			<circle cx="620" cy="508" r="3" />
			<circle cx="668" cy="498" r="2" />
			<circle cx="730" cy="512" r="2.5" />
		</g>
		<circle class="moon" cx="230" cy="140" r="30" />
	</svg>

	<!-- 窓枠: 太めの外枠 + 十字の桟。部屋の内側から外を見ている体 -->
	<div class="frame edge"></div>
	<div class="frame v"></div>
	<div class="frame h"></div>

	<!-- 手前の室内: 机の面と、夕方以降だけ灯るランプのグロー -->
	<div class="desk"></div>
	<div class="lamp"></div>

	<!-- 漂う塵 (昼) / 光の粒 (夜)。位置と周期は --i から決める疑似乱数 -->
	{#each Array(14) as _, i}
		<span class="mote" style="--i: {i}"></span>
	{/each}
</div>

<style lang="sass">
.scene
	position: absolute
	inset: 0
	overflow: hidden

.sky
	position: absolute
	inset: 0
	opacity: 0
	transition: opacity 3s ease

	&.dawn
		background: linear-gradient(to top, #d9906a 0%, #b0728a 35%, #4a4a78 70%, #2a3050 100%)

	&.day
		background: linear-gradient(to top, #dcebf2 0%, #a8c8de 45%, #7ea7c9 100%)

	&.dusk
		background: linear-gradient(to top, #e0895a 0%, #a05a68 40%, #504068 75%, #302a50 100%)

	&.night
		background: linear-gradient(to top, #26314f 0%, #17203a 50%, #0b1026 100%)

.scene[data-band='dawn'] .sky.dawn,
.scene[data-band='day'] .sky.day,
.scene[data-band='dusk'] .sky.dusk,
.scene[data-band='night'] .sky.night
	opacity: 1

.far
	position: absolute
	inset: 0
	width: 100%
	height: 100%

	.hill.back
		fill: rgba(20, 26, 40, 0.35)

	.hill.front
		fill: rgba(14, 18, 30, 0.55)

	// 街明かりと月は夜だけ。昼は空に溶ける (opacity 0)。
	.town circle
		fill: #ffd98a
		opacity: 0
		transition: opacity 3s ease

	.moon
		fill: rgba(245, 240, 220, 0.9)
		opacity: 0
		transition: opacity 3s ease

.scene[data-band='night'] .town circle
	opacity: 0.9

.scene[data-band='night'] .moon
	opacity: 0.85

// 窓枠。theme トークンではなく木枠の固定色 (シーンの一部であり chrome ではない)。
.frame
	position: absolute
	background: #241c16
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04)

	&.edge
		inset: 0
		background: transparent
		border: 14px solid #241c16
		box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.35)

	&.v
		top: 0
		bottom: 0
		left: 50%
		width: 10px
		transform: translateX(-50%)

	&.h
		left: 0
		right: 0
		top: 38%
		height: 10px

.desk
	position: absolute
	left: 0
	right: 0
	bottom: 0
	height: 12%
	background: linear-gradient(to top, #171310 0%, #2b211a 85%, #3a2d22 100%)

// ランプのグロー。dusk / night だけふわっと灯る。
.lamp
	position: absolute
	right: -6%
	bottom: 2%
	width: 40%
	height: 45%
	background: radial-gradient(closest-side, rgba(255, 190, 110, 0.28), transparent 70%)
	opacity: 0
	transition: opacity 3s ease

.scene[data-band='dusk'] .lamp,
.scene[data-band='night'] .lamp
	opacity: 1

// 漂う粒。--i (0..13) から left / delay / duration を決める — 乱数無しで散らす。
.mote
	position: absolute
	left: calc((var(--i) * 7.31%) + 2%)
	bottom: 18%
	width: 4px
	height: 4px
	border-radius: var(--radius-full)
	background: rgba(255, 255, 255, 0.35)
	animation: drift calc(11s + var(--i) * 1.3s) linear infinite
	animation-delay: calc(var(--i) * -2.7s)

.scene[data-band='night'] .mote
	background: rgba(255, 226, 160, 0.5)

@keyframes drift
	0%
		transform: translate(0, 0)
		opacity: 0
	15%
		opacity: 0.7
	85%
		opacity: 0.4
	100%
		transform: translate(24px, -46vh)
		opacity: 0

@media (prefers-reduced-motion: reduce)
	.mote
		animation: none
		opacity: 0
</style>
