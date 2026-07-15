// 公式立ち絵 moca_illust.zip (PNG 232枚) のマニフェスト。構造は 18目元セット ×
// 13口差分で、境界と例外は隣接ピクセル差分で実測済み (メモリ: moca-illust-asset-structure):
//   - 標準セット: 先頭 = 閉じ口ベース、以降 +1..+12 が固定順の口差分
//   - セット196 (微笑み): 三角口が欠落した 12 枚
//   - セット208 (眠そう): 閉じ口ベースが欠落した 12 枚 (休止口は「ん」=213)
// 素材は再配布禁止のため非同梱。サーバの /moca-assets (MOCA_ASSETS_DIR) から配る。

// 口差分の正順 (ユーザー実見で確定)。offset 0 がベース (閉じ口)。
export const MOUTHS = [
	'rest', // 閉じ口
	'a',
	'i',
	'u',
	'e',
	'o',
	'n',
	'nikkori', // (にっこり)
	'mutto', // むっ
	'sankaku', // お口三角 (嫌そう)
	'ee', // えぇ……
	'fuun', // ふーん♪
	'muu' // むぅ……
];

// 標準 13 枚セット: base + offset の算術で口表を作る。
function standardSet(base, extra = {}) {
	const mouths = {};
	MOUTHS.forEach((key, i) => {
		mouths[key] = base + i;
	});
	return { rest: base, mouths, blink: null, ...extra };
}

// 目元セット。key は Codex の画像認識による命名 (ラベルはツールチップ等の将来用)。
// blink はそのセットの瞬き差分セット key (無い表情は瞬きしない)。
export const EYES = {
	normal: { label: '通常', ...standardSet(1, { blink: 'normalBlink' }) },
	normalBlink: { label: '通常・目閉じ', ...standardSet(14) },
	smileClosed: { label: '目閉じ微笑み', ...standardSet(27) },
	serious: { label: '真剣', ...standardSet(40) },
	worried: { label: '困り顔', ...standardSet(53, { blink: 'worriedBlink' }) },
	worriedBlink: { label: '困り顔・目閉じ', ...standardSet(66) },
	blushSmileClosed: { label: '赤面微笑み', ...standardSet(79) },
	blush: { label: '赤面', ...standardSet(92, { blink: 'blushBlink' }) },
	blushBlink: { label: '赤面・目閉じ', ...standardSet(105) },
	bashfulSmileClosed: { label: '照れ笑い', ...standardSet(118) },
	bashful: { label: '照れ顔', ...standardSet(131, { blink: 'bashfulBlink' }) },
	bashfulBlink: { label: '照れ顔・目閉じ', ...standardSet(144) },
	deepBlushSmile: { label: '強い赤面笑顔', ...standardSet(157) },
	teary: { label: '涙目', ...standardSet(170) },
	tearyJito: { label: '涙目ジト目', ...standardSet(183) },
	// 例外セット: 三角口欠落。明示表で持つ (算術にしない)。
	smile: {
		label: '微笑み',
		rest: 196,
		blink: 'smileBlink',
		mouths: {
			rest: 196,
			a: 197,
			i: 198,
			u: 199,
			e: 200,
			o: 201,
			n: 202,
			nikkori: 203,
			mutto: 204,
			sankaku: null,
			ee: 205,
			fuun: 206,
			muu: 207
		}
	},
	// 例外セット: 閉じ口ベース欠落。休止口は「ん」(213) で代用する。
	sleepy: {
		label: '眠そう',
		rest: 213,
		blink: null,
		mouths: {
			rest: null,
			a: 208,
			i: 209,
			u: 210,
			e: 211,
			o: 212,
			n: 213,
			nikkori: 214,
			mutto: 215,
			sankaku: 216,
			ee: 217,
			fuun: 218,
			muu: 219
		}
	},
	smileBlink: { label: '微笑み・目閉じ', ...standardSet(220) }
};

const pad3 = (n) => String(n).padStart(3, '0');

// 目元 × 口 → 画像 URL。欠落口 (と未知キー) はそのセットの休止口へフォールバック。
export function imageFor(eyeKey, mouthKey = 'rest') {
	const eye = EYES[eyeKey] ?? EYES.normal;
	const file = eye.mouths[mouthKey] ?? eye.rest;
	return `/moca-assets/moca_illust/${pad3(file)}.png`;
}

// セリフの感情サマリ ({axis: max0-100}) から目元セットを選ぶ。しきい値未満は
// 素の表情のまま。優先順は「強い表現ほど勝つ」: 怒り > 涙 > 照れ系 > ほんわか。
export function eyeForEmotion(summary, fallback = 'normal') {
	if (!summary) return fallback;
	const v = (k) => summary[k] ?? 0;
	if (v('angry') >= 40) return 'serious';
	if (v('teary') >= 40) return 'teary';
	if (v('honwaka') >= 60) return 'smile';
	if (v('honwaka') >= 30) return 'normal';
	if (v('bosoboso') >= 50) return 'sleepy';
	if (v('doyaru') >= 40) return 'smile';
	return fallback;
}
