<script>
	import { voice } from '$lib/work/voice.svelte.js';
	import { EYES, imageFor } from '$lib/work/portrait.js';

	// 立ち絵レイヤー。表情 (目元) × 口の 2 軸を <img> の差し替えだけで動かす —
	// Live2D 不使用のパラパラ漫画方式。将来 MMD 版と差し替えられるよう、外部への
	// 露出はこのコンポーネント 1 枚に閉じる。素材未配置 (404) なら丸ごと消える。
	let available = $state(null);

	$effect(() => {
		const probe = new Image();
		probe.onload = () => (available = true);
		probe.onerror = () => (available = false);
		probe.src = imageFor('normal', 'rest');
		return () => {
			probe.onload = null;
			probe.onerror = null;
		};
	});

	// OS の「視差効果を減らす」変更に追随する (matches のスナップショットにしない)。
	const rmQuery = matchMedia('(prefers-reduced-motion: reduce)');
	let reducedMotion = $state(rmQuery.matches);
	$effect(() => {
		const onChange = () => (reducedMotion = rmQuery.matches);
		rmQuery.addEventListener('change', onChange);
		return () => rmQuery.removeEventListener('change', onChange);
	});

	// アイドル顔は 001=normal 固定 (ユーザー確定: 表情はセリフ・演出に割り振り、
	// デフォルトは動かさない。208 は「半眼」ではなくほぼ目瞑りに見えるので不採用)。
	// voice.expression (セリフごとの表情・目閉じホールド) が最優先。
	let eye = $derived(voice.expression ?? 'normal');

	// 瞬き: 3〜8 秒間隔で 120ms だけ瞬き差分セットに切り替える。瞬きペアの無い
	// 表情 (目閉じ系・眠そう) はスキップ。発話中も止める — 瞬き×口の組み合わせ
	// 画像を全部温めるのは重すぎるし、話すときに目を見開くのはむしろ自然。
	// reduced-motion では動かさない。
	let blinking = $state(false);
	$effect(() => {
		if (!EYES[eye]?.blink || voice.speaking || reducedMotion) return;
		let alive = true;
		let closeTimer = null;
		let openTimer = null;
		const loop = () => {
			closeTimer = setTimeout(
				() => {
					if (!alive) return;
					blinking = true;
					openTimer = setTimeout(() => {
						if (!alive) return;
						blinking = false;
						loop();
					}, 120);
				},
				3_000 + Math.random() * 5_000
			);
		};
		loop();
		return () => {
			alive = false;
			clearTimeout(closeTimer);
			clearTimeout(openTimer);
			blinking = false;
		};
	});

	// 口パク: 再生中だけ 110ms 周期で母音系をランダム巡回 (音素解析はしない)。
	const LIP = ['a', 'i', 'u', 'e', 'o', 'n'];
	let mouth = $state('rest');
	$effect(() => {
		if (!voice.speaking || reducedMotion) {
			mouth = 'rest';
			return;
		}
		const iv = setInterval(() => {
			mouth = Math.random() < 0.25 ? 'rest' : LIP[Math.floor(Math.random() * LIP.length)];
		}, 110);
		return () => {
			clearInterval(iv);
			mouth = 'rest';
		};
	});

	// 口元: 発話中は口パク、非発話時は演出の余韻 (moodMouth) があればそれ、なければ休止。
	let src = $derived.by(() => {
		const def = EYES[eye];
		const shownEye = blinking && def?.blink ? def.blink : eye;
		return imageFor(shownEye, voice.speaking ? mouth : (voice.moodMouth ?? 'rest'));
	});

	// 表情が変わったら、その表情の口パク全種 (rest+母音6) と瞬きだけ温める
	// (全 232 枚 158MB のプリロードは禁止 — 残りはブラウザキャッシュに任せる)。
	// 発話中の瞬きは止めているので、瞬き×口の組み合わせは温めなくてよい。
	$effect(() => {
		const def = EYES[eye];
		if (!def || !available) return;
		const warm = ['rest', ...LIP].map((m) => imageFor(eye, m));
		if (def.blink) warm.push(imageFor(def.blink, 'rest'));
		for (const url of warm) {
			new Image().src = url;
		}
	});
</script>

{#if available}
	<div class="bust">
		<img
			class="portrait"
			{src}
			alt="宮舞モカ"
			draggable="false"
			onerror={() => (available = false)}
		/>
	</div>
{/if}

<style lang="sass">
// ノートPCのカメラに写っている想定なので全身は見せない。元画像 (1414x2000) の
// x 420-1000 / y 30-570 = 顔〜リボンの下端ギリギリまでを切り出す (ユーザー確定:
// 手元は絶対に写さない — 立ち絵の手はろくろを回しているので作業中に見えない。
// 胸元で組んだ手は src y≈600 から始まるため、下端 570 で確実にフレーム外)。
.bust
	position: relative
	height: 100%
	aspect-ratio: 580 / 540
	overflow: hidden

// クロップ領域の換算: 幅 = 1414/580、左 = -420/580、上 = -30/540 (コンテナ基準)。
.portrait
	position: absolute
	width: 243.8%
	left: -72.4%
	top: -5.6%
	max-width: none
	user-select: none
	animation: breathe-sway 6s ease-in-out infinite alternate

@keyframes breathe-sway
	from
		transform: translateY(0)
	to
		transform: translateY(4px)

@media (prefers-reduced-motion: reduce)
	.portrait
		animation: none
</style>
