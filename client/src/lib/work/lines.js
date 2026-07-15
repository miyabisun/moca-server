// 作業タブの固定セリフ集。1 エントリ = POST /say にそのまま渡せる script JSON
// (segment 配列)。感情軸は emotions.js の5軸 0-100、speed 50-200 / pause ms。
// カテゴリはタイマーの節目イベントと 1:1 (voice.svelte.js が対応表を持つ)。
// midWork だけは Phase 2 のチャッター用: bosoboso 低め + speed 控えめの小声演出。
export const workLines = {
	// タイマー開始
	start: [
		[{ text: 'それじゃ、始めましょっか。', emotion: { honwaka: 40 } }],
		[{ text: '今日もいっしょにがんばりましょう。', emotion: { honwaka: 55 } }],
		[
			{
				text: 'タイマー、スタートです。集中していきましょう。',
				emotion: { doyaru: 30 }
			}
		],
		[
			{ text: 'ん、準備はいいですか?', emotion: { honwaka: 30 }, pause: 400 },
			{ text: 'はじめますよ。', emotion: { honwaka: 40 } }
		]
	],
	// 作業終了 → 休憩入り
	breakStart: [
		[
			{
				text: 'おつかれさまです。ちょっと休憩にしましょう。',
				emotion: { honwaka: 60 }
			}
		],
		[
			{
				text: 'はい、そこまで。お茶でも飲みませんか。',
				emotion: { honwaka: 50 }
			}
		],
		[
			{
				text: 'いったん手を止めてください。',
				emotion: { doyaru: 25 },
				pause: 300
			},
			{ text: '休むのも仕事のうちですよ。', emotion: { honwaka: 45 } }
		],
		[
			{
				text: 'よくがんばりました。少し伸びでもしましょっか。',
				emotion: { honwaka: 65 }
			}
		]
	],
	// 休憩終了 → 次のセットへ
	breakEnd: [
		[{ text: 'そろそろ再開しましょっか。', emotion: { honwaka: 40 } }],
		[
			{
				text: '休憩おわりです。次もいいペースでいきましょう。',
				emotion: { doyaru: 35 }
			}
		],
		[
			{ text: 'ふぅ。', emotion: { bosoboso: 30 }, pause: 500 },
			{ text: 'それじゃ、続きをやりましょう。', emotion: { honwaka: 40 } }
		]
	],
	// 全セット完了
	allDone: [
		[
			{
				text: '全部おわりました。今日は本当におつかれさまでした。',
				emotion: { honwaka: 75 }
			}
		],
		[
			{ text: 'おつかれさまでした。', emotion: { honwaka: 70 }, pause: 400 },
			{ text: 'えへへ、最後までえらかったですね。', emotion: { honwaka: 80 } }
		],
		[
			{
				text: 'これで終了です。あとはゆっくりしてくださいね。',
				emotion: { honwaka: 60 }
			}
		]
	],
	// スリープ復帰などで遷移をまとめて消化したとき (現在の状態だけ一度案内)
	resume: [
		[
			{
				text: 'あ、おかえりなさい。タイマーは進めておきましたよ。',
				emotion: { honwaka: 45 }
			}
		],
		[
			{
				text: 'んん、続きからやりましょっか。',
				emotion: { bosoboso: 25, honwaka: 30 }
			}
		]
	],
	// 作業中にたまに小声で一言 (Phase 2 のチャッター)
	midWork: [
		[{ text: 'ん、順調そうですね。', emotion: { bosoboso: 35 }, speed: 95 }],
		[
			{
				text: 'わたしもこっち、進めてますからね。',
				emotion: { bosoboso: 40 },
				speed: 92
			}
		],
		[
			{
				text: 'ふんふん、ふーん……。',
				emotion: { bosoboso: 45, honwaka: 25 },
				speed: 90
			}
		],
		[
			{
				text: 'お水、ちゃんと飲んでますか。',
				emotion: { bosoboso: 30, honwaka: 30 },
				speed: 95
			}
		],
		[
			{
				text: 'その調子、その調子。',
				emotion: { bosoboso: 35, doyaru: 20 },
				speed: 95
			}
		]
	]
};

// 直前と同じセリフを引かないだけの軽い重複回避。カテゴリごとに前回の添字を覚える。
const lastPick = {};

export function pickLine(category) {
	const pool = workLines[category];
	if (!pool || pool.length === 0) return null;
	let idx = Math.floor(Math.random() * pool.length);
	if (pool.length > 1 && idx === lastPick[category]) idx = (idx + 1) % pool.length;
	lastPick[category] = idx;
	return pool[idx];
}
