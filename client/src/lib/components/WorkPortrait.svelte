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

	// ベース表情: 休憩中は微笑み、それ以外は通常。声かけ中はセリフの感情サマリで
	// 上書きする (emotions.js の 5 軸 → portrait.js の対応表)。
	let baseEye = $derived(timer.phase === 'break' ? 'smile' : 'normal');
	let eye = $derived(
		voice.speaking ? eyeForEmotion(summarizeEmotion(voice.currentScript), baseEye) : baseEye
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
	<img class="portrait" {src} alt="宮舞モカ" draggable="false" onerror={() => (available = false)} />
{/if}

<style lang="sass">
// ゆっくりした呼吸ゆらぎ。画像の差し替え (表情・口) とは独立した CSS だけの動き。
.portrait
	height: 100%
	max-width: none
	object-fit: contain
	object-position: bottom
	user-select: none
	animation: breathe-sway 6s ease-in-out infinite alternate

@keyframes breathe-sway
	from
		transform: translateY(0)
	to
		transform: translateY(3px)

@media (prefers-reduced-motion: reduce)
	.portrait
		animation: none
</style>
