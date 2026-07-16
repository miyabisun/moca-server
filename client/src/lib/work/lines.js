// 作業タブの固定セリフ集。1 エントリ = { eye, script }:
//   - script は POST /say にそのまま渡せる script JSON (segment 配列)
//   - eye は喋っている間の目元セット (portrait.js の EYES キー)。
//     「目を閉じたまま話しかけてくることは基本ない」ので、通常セリフは
//     開眼系のみ。目閉じ系 (normalBlink/worriedBlink/blushBlink/smileClosed)
//     はシーケンスのホールドと瞬きだけが使う
//
// ペルソナ (ユーザー確定。src/routes/work.rs の PERSONA と揃える):
// - モカは高校2年生。相手 (ユーザー) は同級生の女友達
// - 「一人だと試験勉強をサボる」から始まった相互監視のゆる作業通話が習慣化して、
//   今日はその何気ない n 回目。だから口調は砕けたタメ口、気負いゼロ
// - honwaka は 20 以下。基本はニュートラルが一番自然で、ゆったり感は speed 90 前後
// - 表情の使い分け: 話しかけ (雑談・節目) は 001=normal でこちらを見る。
//   独り言は半眼 (sleepy) を基本に、内容へ合わせて割り振る

// 独り言 1 フレーズ。既定で bosoboso 55 + speed 90 のぼそぼそ小声。
// 目は 001=normal 基準 (208 は「半眼」ではなくほぼ目瞑りに見えるため使わない)。
const mutter = (text, extra = {}, eye = 'normal') => ({
	eye,
	script: [{ text, speed: 90, ...extra, emotion: { bosoboso: 55, ...(extra.emotion ?? {}) } }]
});

// 話しかけ (モカがカメラ=こちらを見て話す)。目は 001=normal。
const say = (segments, eye = 'normal') => ({ eye, script: segments });

export const workLines = {
	// タイマー開始
	start: [
		say([{ text: 'んじゃ、始めよっか。' }]),
		say([{ text: 'はーい、作業会かいさーい。', speed: 98 }]),
		say([{ text: 'タイマー入れるよー。よーい、どん。' }]),
		say([{ text: 'わたしもこっちやるから、お互いがんばろ。', speed: 95 }]),
		say([{ text: '今日もゆるっとやってこー。', speed: 92 }])
	],
	// 作業終了 → 休憩入り (このあと voice がシーケンスで「うぅ、疲れたぁ」に繋ぐ)
	breakStart: [
		say([{ text: 'はい、そこまでー。', speed: 95 }]),
		say([{ text: 'おつかれー、休憩休憩。', speed: 95 }]),
		say([{ text: 'いったん手止めよ。お茶お茶。', speed: 94 }])
	],
	// 休憩入りシーケンスの締め (目を閉じたまま漏れる一言)
	breakTired: [
		{
			eye: 'normalBlink',
			script: [{ text: 'うぅ、疲れたぁ……。', speed: 85, emotion: { bosoboso: 50 } }]
		},
		{
			eye: 'normalBlink',
			script: [{ text: 'ふはぁ……。がんばったぁ……。', speed: 84, emotion: { bosoboso: 50 } }]
		}
	],
	// 終了 (ユーザーがセッション中に終了ボタンを押したとき)
	end: [
		say([{ text: '終わりー。おつかれさま。', emotion: { honwaka: 15 }, speed: 94 }]),
		say([
			{ text: 'はい、今日はここまで。', pause: 300 },
			{ text: 'ちゃんと寝なよー?', speed: 92 }
		]),
		say([{ text: 'おつかれ。わたしもキリついたし、のんびりしよ。', speed: 92 }])
	],
	// スリープ復帰などで遷移をまとめて消化したとき (現在の状態だけ一度案内)
	resume: [
		say([{ text: 'あ、おかえり。タイマー進めといたよ。', speed: 92 }]),
		say([{ text: 'ん、戻った? 続きやろ。', speed: 92 }])
	],
	// 休憩明けの問いかけ (askNext)。時間帯別プールは pickAskLine が選ぶ
	askGeneric: [
		say([{ text: '休憩おわりだけど、もう1セットやる?', speed: 94 }]),
		say([{ text: 'どうするー? 続ける?', speed: 92 }]),
		say([{ text: '作業おわった? まだいけそう?', speed: 92 }]),
		say([{ text: 'もうひと山いく? やめとく?', speed: 94 }])
	],
	// お昼は 12 時をまたいだかで言い回しを変える (11時台 = そろそろ / 12時台 = 出遅れ)
	askLunch: [
		say([{ text: 'そろそろお昼だけど、ごはんどうする?', speed: 92 }]),
		say([{ text: 'お昼たべてからにする? それとももう1セット?', speed: 92 }])
	],
	askLunchLate: [
		say([{ text: '出遅れ気味だけど、お昼どうする?', speed: 92 }]),
		say([{ text: 'もうお昼まわってるよ。ごはん食べた?', speed: 92 }])
	],
	askDinner: [
		say([{ text: '夜ごはんどうする? 食べてからでもいいよ。', speed: 92 }]),
		say([{ text: 'そろそろ夕飯の時間じゃない? 続ける?', speed: 92 }])
	],
	askNight: [
		say([{ text: 'もういい時間だよ? 今日は終わらない?', speed: 90 }]),
		say([{ text: 'もう夜だしさ、無理しないで終わっとく?', speed: 90 }])
	],
	// 作業中に漏れる独り言と、集中が切れたときのどうでもいい雑談 (チャッター)
	midWork: [
		// --- 思考中 (半眼が基本、詰まると真剣/ジト) ---
		mutter('ええと……。', { speed: 88 }),
		mutter('うーん……。', { speed: 86 }),
		mutter('あれ、なんだっけ……。'),
		mutter('えっと、どこまでやったっけ。'),
		mutter('んー……。', { speed: 85 }),
		mutter('はて……。', { speed: 88 }),
		mutter('そうじゃなくて……。', {}, 'serious'),
		mutter('こう、かな……。', { speed: 88 }),
		mutter('いや、違うな……。', {}, 'serious'),
		mutter('どうしよっかな……。', { speed: 90 }),
		mutter('まてよ……?', {}, 'serious'),
		mutter('こっちが先か……。'),
		mutter('ふむ……。', { speed: 86 }),
		mutter('なるほど……?', {}, 'normal'),
		mutter('なるほどね……。', { speed: 90 }, 'normal'),
		mutter('ちょっと整理しよ……。', {}, 'serious'),
		mutter('一回落ち着こう……。', { speed: 88 }, 'serious'),
		mutter('えー、なんでだろ。', {}, 'serious'),
		mutter('うーん、惜しい……。'),
		mutter('あとちょっとな気がする……。'),
		mutter('ここが噛み合わない……。', {}, 'serious'),
		mutter('順番が違うのかな……。'),
		mutter('もう一回読も……。', { speed: 90 }),
		mutter('お、つながってきた……。', {}, 'normal'),
		mutter('これ、前もやったような……。', {}, 'tearyJito'),
		// --- 進捗・うまくいった (顔が上がる) ---
		mutter('よし、動いた!', { emotion: { doyaru: 20 }, speed: 100 }, 'normal'),
		mutter('できた……!', { emotion: { doyaru: 15 }, speed: 96 }, 'normal'),
		mutter('お、いい感じ。', { speed: 95 }, 'normal'),
		mutter('よしよし……。', { speed: 90 }, 'smile'),
		mutter('うん、これでいい。', {}, 'normal'),
		mutter('ふふ、天才かも。', { emotion: { doyaru: 25 }, speed: 96 }, 'smile'),
		mutter('順調順調……。', { speed: 94 }, 'smile'),
		mutter('あと少し……。'),
		mutter('ここまでは OK……。', {}, 'normal'),
		mutter('お、直った。', { speed: 96 }, 'normal'),
		mutter('うん、悪くない。', {}, 'normal'),
		mutter('よし、次。', { speed: 96 }, 'normal'),
		mutter('一個終わり……っと。', {}, 'normal'),
		mutter('えらいぞ、わたし。', { emotion: { doyaru: 20 }, speed: 95 }, 'smile'),
		mutter('お、そういうことか。', { speed: 96 }, 'normal'),
		mutter('見えてきた見えてきた。', { speed: 96 }, 'normal'),
		mutter('この調子この調子……。', { speed: 94 }, 'smile'),
		mutter('思ったより進んでるかも……。', {}, 'normal'),
		mutter('きれいにまとまった気がする。', {}, 'normal'),
		mutter('うん、読みやすい。', {}, 'normal'),
		// --- ミス・トラブル (ジト目・真剣・涙目) ---
		mutter('うわ、消しちゃった……。', { emotion: { teary: 20 }, speed: 95 }, 'teary'),
		mutter('あー……保存してない……。', { emotion: { teary: 25 }, speed: 90 }, 'teary'),
		mutter('あれ、動かない……。', {}, 'serious'),
		mutter('なんで!?', { emotion: { angry: 15 }, speed: 105 }, 'serious'),
		mutter('さっきまで動いてたのに……。', { emotion: { bosoboso: 30 } }, 'tearyJito'),
		mutter('うそでしょ……。', { speed: 90 }, 'tearyJito'),
		mutter('また誤字ってる……。', { emotion: { bosoboso: 25 } }, 'tearyJito'),
		mutter('ここ違うじゃん……。', {}, 'serious'),
		mutter('はぁ、やり直し……。', { emotion: { bosoboso: 30 }, speed: 88 }, 'tearyJito'),
		mutter('んん!?', { speed: 105 }, 'serious'),
		mutter('……見なかったことにしよ。', { speed: 90 }, 'tearyJito'),
		mutter('おかしいなぁ……。', {}, 'serious'),
		mutter('誰だこれ書いたの……わたしだ。', { emotion: { bosoboso: 25 } }, 'tearyJito'),
		mutter('落ち着け、わたし……。', { speed: 88 }, 'serious'),
		mutter('一文字違いかぁ……。', { emotion: { bosoboso: 20 } }, 'tearyJito'),
		mutter('惜しいことしたな……。'),
		mutter('これは沼の気配……。', { emotion: { bosoboso: 30 }, speed: 90 }, 'tearyJito'),
		mutter('うぅ、進まない……。', { emotion: { teary: 15 }, speed: 88 }, 'teary'),
		// --- 小休止・生活 (半眼のまま) ---
		mutter('お茶飲も……。', { speed: 90 }),
		mutter('んー、伸びー……。', { speed: 85 }),
		mutter('ちょっと目が疲れたかも……。', { speed: 88 }),
		mutter('肩まわそ……。', { speed: 88 }),
		mutter('水分水分……。', { speed: 92 }),
		mutter('ふぅ……。', { speed: 85 }),
		mutter('よいしょ……。', { speed: 88 }),
		mutter('すー、はー……。', { speed: 85 }),
		mutter('ちょっとお腹すいたかも……。', { speed: 90 }),
		mutter('ごはん何にしよっかな……。', { speed: 90 }),
		mutter('目薬さそ……。', { speed: 90 }),
		mutter('姿勢なおそ……。', { speed: 90 }),
		mutter('指ぽきぽき……。', { speed: 90 }),
		mutter('まばたき忘れてた……。', { speed: 90 }),
		mutter('部屋、ちょうどいい温度だな……。', { speed: 90 }),
		// --- 実況ぎみの独り言 (半眼のまま) ---
		mutter('ここをこうして……。'),
		mutter('これをこっちに……。'),
		mutter('次はこれ……。'),
		mutter('読み込んで……。'),
		mutter('保存……っと。'),
		mutter('コピーして、貼り付け……。'),
		mutter('ちょっと検索しよ……。'),
		mutter('資料読も……。'),
		mutter('メモメモ……。', { speed: 94 }),
		mutter('後で直そ、後で……。', { speed: 94 }),
		mutter('これは明日のわたしに任せた……。', {}, 'tearyJito'),
		mutter('優先度は……こっちが先。', {}, 'serious'),
		mutter('見直し見直し……。', { speed: 94 }),
		mutter('答え合わせしよ……。'),
		mutter('うん、問題なし。', { speed: 95 }, 'normal'),
		mutter('ここ、名前どうしよ……。'),
		mutter('とりあえずやってみよ……。'),
		mutter('下書きでいいから書いちゃお……。'),
		mutter('一旦全部並べてみよ……。'),
		mutter('消すの怖いから残しとこ……。'),
		// --- 鼻歌・くせ ---
		mutter('ふんふん、ふーん……。', { speed: 88 }, 'smile'),
		mutter('ふんふんふーん……。', { speed: 88 }, 'smile'),
		mutter('たたたっと……。', { speed: 95 }),
		mutter('……っと。', { speed: 92 }),
		mutter('カタカタうるさくないかな、わたし……。', { emotion: { bosoboso: 25 } }, 'normal'),
		mutter('しーん、としてる……。', { emotion: { bosoboso: 20 }, speed: 90 }),
		mutter('集中してるなぁ……。', { emotion: { bosoboso: 20 }, speed: 90 }, 'normal'),
		mutter('わたしも負けてられない……。', { speed: 94 }, 'serious'),
		mutter('もくもく……。', { speed: 90 }),
		mutter('ん、いい時間の流れ……。', { speed: 88 }, 'smile'),
		// --- 集中が切れたときの、くっそどうでもいい雑談 (話しかけ = こちらを見る) ---
		mutter('ねえ聞いて。今日の購買、焼きそばパン一瞬で消えた。', { speed: 96 }, 'normal'),
		mutter('新作のアイス、結局まだ食べてないんだよね……。', { speed: 94 }, 'normal'),
		mutter('数学の小テスト、ノー勉でいくか迷ってる……。', { speed: 94 }, 'normal'),
		mutter('前髪切りすぎた話、聞く? ……やっぱいい。', { speed: 94 }, 'normal'),
		mutter('自販機のいちごオレ、売り切れてたんだけど。', { speed: 96 }, 'normal'),
		mutter('消しゴム落とした。今日3回目。', { speed: 94 }, 'normal'),
		mutter('スマホ見たら負けだと思ってる、今は。', { speed: 94 }, 'normal'),
		mutter('明日って体育あったっけ……あったら嫌だな。', { speed: 92 }, 'normal'),
		mutter('シャー芯、さっき全部折れた。どうでもいいけど。', { speed: 94 }, 'normal'),
		mutter('ねー、集中してる? ……してるか。ごめん。', { speed: 92 }, 'normal'),
		mutter('試験終わったらどっか行こうね。', { emotion: { honwaka: 15 }, speed: 94 }, 'smile'),
		mutter('眠くなってきたかも……あと10分がんばる。', { speed: 88 }, 'normal'),
		mutter('隣の家の犬、今日もずっと鳴いてる。', { speed: 92 }, 'normal'),
		mutter('靴下、左右違うの履いてた。誰も見てないからセーフ。', { speed: 94 }, 'normal'),
		mutter('今日の夕焼け、すごかったんだけど。見た?', { speed: 94 }, 'normal')
	]
};

// 目を閉じて余韻をもたせる「台本シーケンス」(ユーザー確定)。
// voice.svelte.js が opener → hold (目閉じ ms) → closer → mood の順に演じる。
// hold の目閉じ系セット: normalBlink=素の目閉じ / blushBlink=悲しげな目閉じ /
// smileClosed=にこにこ目閉じ (portrait.js の実測マッピング参照)。
export const performances = [
	{
		// ひと休みのつぶやき → 目を閉じて 8 秒 → 気合いを入れ直す
		openers: [
			mutter('ううんー、伸びぃー……。', { speed: 82 }, 'normal'),
			mutter('ええと、っと……。', { speed: 88 }),
			mutter('ねむ……。', { speed: 82 }),
			mutter('晩ごはん、何かなぁ……。', { speed: 90 }, 'normal')
		],
		hold: { eye: 'normalBlink', ms: 8_000 },
		closer: mutter('よし、集中!', { speed: 100, emotion: { bosoboso: 0, doyaru: 15 } }, 'serious')
	},
	{
		// へこみ → 目を閉じて泣き顔 8 秒 → 切り替える
		openers: [
			mutter('マジかぁ……。', { speed: 88 }, 'tearyJito'),
			mutter('うそでしょぉ……。', { speed: 86, emotion: { teary: 20 } }, 'teary'),
			mutter('ひーん……。', { speed: 88, emotion: { teary: 30 } }, 'teary')
		],
		hold: { eye: 'blushBlink', ms: 8_000 },
		closer: mutter('しょうがない、切り替えてこ。', { speed: 95, emotion: { bosoboso: 30 } }, 'normal')
	},
	{
		// ひとりでドヤる → 目を閉じて余韻 8 秒 → 半眼に戻るが口元は 20 秒嬉しいまま
		openers: [mutter('ふふん、さすがはわたし。', { emotion: { doyaru: 35 }, speed: 96 }, 'smile')],
		hold: { eye: 'smileClosed', ms: 8_000 },
		closer: null,
		mood: { mouth: 'nikkori', ms: 20_000 }
	}
];

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

// 休憩明けの問いかけ。時間帯に合うプールがあればそちら優先 (お昼前 11時台 /
// お昼過ぎ 12時台 / 夕飯 17-19 / 夜 21時以降と深夜)、それ以外は汎用の
// 「もう1セットやる?」系。
export function pickAskLine(hour) {
	if (hour === 11) return pickLine('askLunch');
	if (hour === 12) return pickLine('askLunchLate');
	if (hour >= 17 && hour < 19) return pickLine('askDinner');
	if (hour >= 21 || hour < 4) return pickLine('askNight');
	return pickLine('askGeneric');
}
