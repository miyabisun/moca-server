<script>
	import { timer } from '$lib/work/timer.svelte.js';
	import { voice } from '$lib/work/voice.svelte.js';
	import { EYES, imageFor, eyeForEmotion } from '$lib/work/portrait.js';
	import { summarizeEmotion } from '$lib/emotions.js';

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

	// ベース表情はドリフトさせる。年頃の少女がずっと真顔は不自然 (ユーザー確定):
	// しかめっ面 (真剣)・半眼ジト・目瞑り・眠そう・たまにサボってる感を、
	// 20〜50 秒ごとに重み付きプールから引き直す。声かけ中はセリフの感情が勝つ。
	const WORK_POOL = [
		'normal',
		'normal',
		'normal',
		'serious',
		'serious',
		'tearyJito',
		'tearyJito',
		'sleepy',
		'sleepy',
		'smileClosed',
		'smile'
	];
	const BREAK_POOL = ['smile', 'smile', 'smileClosed', 'smileClosed', 'sleepy', 'normal'];
	let idleEye = $state('normal');
	$effect(() => {
		const pool = timer.phase === 'break' ? BREAK_POOL : WORK_POOL;
		idleEye = timer.phase === 'break' ? 'smile' : 'normal'; // フェーズ切替の初期顔
		let alive = true;
		let t = null;
		const loop = () => {
			t = setTimeout(
				() => {
					if (!alive) return;
					idleEye = pool[Math.floor(Math.random() * pool.length)];
					loop();
				},
				20_000 + Math.random() * 30_000
			);
		};
		loop();
		return () => {
			alive = false;
			clearTimeout(t);
		};
	});
	let eye = $derived(
		voice.speaking ? eyeForEmotion(summarizeEmotion(voice.currentScript), idleEye) : idleEye
	);

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

	let src = $derived.by(() => {
		const def = EYES[eye];
		const shownEye = blinking && def?.blink ? def.blink : eye;
		return imageFor(shownEye, voice.speaking ? mouth : 'rest');
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
