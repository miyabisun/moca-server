<script>
	// 背景演出 (純 CSS/SVG、ロジックなし — タイマーや音声には一切触れない)。
	//
	// 構図はモカのノート PC のカメラが写す「彼女の部屋の中」(ユーザー確定):
	// - デスクは部屋の隅、モカはデスクに向かって座り、カメラは彼女と部屋の奥を写す
	// - 右側面の壁に腰高からの窓 → 奥へ向かう壁なのでパースが付き、向こう側の
	//   縦幅が縮む斜めの窓になる (rotateY)
	// - 背面の壁に部屋の出入り口 (ドア)
	// - 左端のクローゼットは「あまり写したくない」ので強い角度でほぼ見切れ
	// - ベッドはカメラに写さない (コンプライアンス)
	//
	// 時間帯 4 種 (dawn 5-8 / day 8-16 / dusk 16-19 / night 19-4) で窓の外の空と
	// 室内の明るさが変わる。グラデーションは transition できないため、層を重ねて
	// opacity クロスフェード。
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
	<!-- 背面の壁 (時間帯で明度が変わる 4 層クロスフェード) -->
	<div class="wall dawn"></div>
	<div class="wall day"></div>
	<div class="wall dusk"></div>
	<div class="wall night"></div>

	<!-- 部屋の出入り口。背面の壁、左寄り -->
	<div class="door"><span class="knob"></span></div>

	<!-- 左端: クローゼット。カメラに写したくないので強い角度でほぼ見切れている -->
	<div class="closet"></div>

	<!-- 右側面の窓。奥 (左) へ向かう壁なのでパースで向こう側が縮む -->
	<div class="window-wrap">
		<div class="sky dawn"></div>
		<div class="sky day"></div>
		<div class="sky dusk"></div>
		<div class="sky night"></div>
		<svg class="far" viewBox="0 0 400 400" preserveAspectRatio="xMidYMax slice">
			<path class="hill" d="M0 300 Q 90 250 180 285 T 400 290 L 400 400 L 0 400 Z" />
			<g class="town">
				<circle cx="90" cy="315" r="2.5" />
				<circle cx="150" cy="322" r="2" />
				<circle cx="255" cy="318" r="2.5" />
				<circle cx="320" cy="325" r="2" />
			</g>
			<circle class="moon" cx="110" cy="90" r="26" />
		</svg>
		<span class="sash v"></span>
		<span class="sash h"></span>
	</div>

	<!-- 夕方以降だけ灯る、デスクランプの光だまり -->
	<div class="lamp"></div>

	<!-- 手前: カメラが載っているデスクの面 -->
	<div class="desk"></div>

	<!-- 部屋を漂う塵 (夜は光の粒に見える)。位置と周期は --i から決める疑似乱数 -->
	{#each Array(12) as _, i}
		<span class="mote" style="--i: {i}"></span>
	{/each}
</div>

<style lang="sass">
.scene
	position: absolute
	inset: 0
	overflow: hidden
	// 窓・クローゼットの rotateY にパースを与える共通視点
	perspective: 1100px
	// 壁 4 層は opacity クロスフェードするため、切替の途中で合成被覆率が
	// 一瞬下がる。素の背景が透けないよう不透明な基底色を敷いておく
	background: #3a3430

.wall
	position: absolute
	inset: 0
	opacity: 0
	transition: opacity 3s ease

	&.dawn
		background: linear-gradient(180deg, #9f8a8c 0%, #8a7476 70%, #6e5c5c 100%)

	&.day
		background: linear-gradient(180deg, #d8ccb8 0%, #c8b9a2 70%, #ab9880 100%)

	&.dusk
		background: linear-gradient(180deg, #8a6650 0%, #7a5844 70%, #5c4234 100%)

	&.night
		background: linear-gradient(180deg, #3a3532 0%, #2c2826 70%, #201d1c 100%)

.scene[data-band='dawn'] .wall.dawn,
.scene[data-band='day'] .wall.day,
.scene[data-band='dusk'] .wall.dusk,
.scene[data-band='night'] .wall.night
	opacity: 1

// 出入り口。背面の壁に付いた素直な板ドア (カメラから見て部屋の向こう側)。
.door
	position: absolute
	left: 13%
	bottom: 16%
	width: 11%
	height: 50%
	background: linear-gradient(180deg, #55402e, #4a3728)
	border: 3px solid rgba(0, 0, 0, 0.25)
	border-radius: 3px 3px 0 0
	box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.25)

	.knob
		position: absolute
		right: 10%
		top: 48%
		width: 7px
		height: 7px
		border-radius: var(--radius-full)
		background: #b8a06a

// クローゼット。左端で強い角度、ほぼ見切れ (写したくない家具)。
// rotateY 正 = 右 (奥) 側が z 奥へ倒れる (origin left、z' = -x·sinθ)。
.closet
	position: absolute
	left: -9%
	top: 2%
	width: 18%
	height: 82%
	transform-origin: left center
	transform: rotateY(52deg)
	background: linear-gradient(90deg, #453a32, #382f29)
	border-right: 4px solid rgba(0, 0, 0, 0.3)
	box-shadow: inset -14px 0 22px rgba(0, 0, 0, 0.3)

// 右側面の窓。origin を右端に置いた rotateY で、奥 (左) 側の縦幅が縮む。
// 負角にするのが正: x<0 の左端は z' = -x·sinθ なので、θ<0 で z 奥へ引っ込む。
// 「腰の高さから」なので下端はデスクより上で切れる。
.window-wrap
	position: absolute
	right: -2%
	top: 12%
	width: 38%
	height: 56%
	transform-origin: right center
	transform: rotateY(-34deg)
	border: 12px solid #241c16
	border-radius: 3px
	overflow: hidden
	// 空 4 層のクロスフェード中に透けないよう、窓の中も不透明な基底色を敷く
	background: #1c2438
	box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.3), 0 4px 18px rgba(0, 0, 0, 0.2)

.sky
	position: absolute
	inset: 0
	opacity: 0
	transition: opacity 3s ease

	&.dawn
		background: linear-gradient(to top, #d9906a 0%, #b0728a 40%, #4a4a78 100%)

	&.day
		background: linear-gradient(to top, #dcebf2 0%, #a8c8de 50%, #7ea7c9 100%)

	&.dusk
		background: linear-gradient(to top, #e0895a 0%, #a05a68 45%, #504068 100%)

	&.night
		background: linear-gradient(to top, #26314f 0%, #17203a 55%, #0b1026 100%)

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

	.hill
		fill: rgba(16, 22, 34, 0.45)

	.town circle
		fill: #ffd98a
		opacity: 0
		transition: opacity 3s ease

	.moon
		fill: rgba(245, 240, 220, 0.9)
		opacity: 0
		transition: opacity 3s ease

.scene[data-band='night'] .far .town circle
	opacity: 0.9

.scene[data-band='night'] .far .moon
	opacity: 0.85

// 窓の桟。フレームと同じ木色
.sash
	position: absolute
	background: #241c16

	&.v
		top: 0
		bottom: 0
		left: 50%
		width: 8px
		transform: translateX(-50%)

	&.h
		left: 0
		right: 0
		top: 46%
		height: 8px

// デスクランプの光だまり。dusk / night だけふわっと灯り、夜の室内の主光源になる
.lamp
	position: absolute
	right: 2%
	bottom: 8%
	width: 46%
	height: 52%
	background: radial-gradient(closest-side, rgba(255, 190, 110, 0.30), transparent 70%)
	opacity: 0
	transition: opacity 3s ease

.scene[data-band='dusk'] .lamp,
.scene[data-band='night'] .lamp
	opacity: 1

// カメラが載っているデスクの面 (画面最下部)。
.desk
	position: absolute
	left: 0
	right: 0
	bottom: 0
	height: 14%
	background: linear-gradient(to top, #1b1512 0%, #33271e 80%, #443528 100%)
	box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.25)

// 部屋を漂う粒。--i (0..11) から left / delay / duration を決める — 乱数無しで散らす。
.mote
	position: absolute
	left: calc((var(--i) * 8.31%) + 2%)
	bottom: 20%
	width: 3px
	height: 3px
	border-radius: var(--radius-full)
	background: rgba(255, 255, 255, 0.3)
	animation: drift calc(11s + var(--i) * 1.3s) linear infinite
	animation-delay: calc(var(--i) * -2.7s)

.scene[data-band='night'] .mote
	background: rgba(255, 226, 160, 0.4)

@keyframes drift
	0%
		transform: translate(0, 0)
		opacity: 0
	15%
		opacity: 0.6
	85%
		opacity: 0.35
	100%
		transform: translate(20px, -42vh)
		opacity: 0

@media (prefers-reduced-motion: reduce)
	.mote
		animation: none
		opacity: 0
</style>
