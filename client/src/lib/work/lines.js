// 作業タブの固定セリフ集。1 エントリ = POST /say にそのまま渡せる script JSON
// (segment 配列)。感情軸は emotions.js の5軸 0-100、speed 50-200 / pause ms。
//
// ペルソナ (ユーザー確定。src/routes/work.rs の PERSONA と揃える):
// - モカは高校2年生。相手 (ユーザー) は同級生の女友達
// - 「一人だと試験勉強をサボる」から始まった相互監視のゆる作業通話が習慣化して、
//   今日はその何気ない n 回目。だから口調は砕けたタメ口、気負いゼロ
// - honwaka は 20 以下 (それ以上は「よそ行きの声」になって不自然)。基本は
//   ニュートラルが一番自然で、ゆったり感は speed 90 前後で代用する
// - midWork は「作業しながら漏れる独り言」+「集中が切れたときの
//   くっそどうでもいい雑談」。話しかけはどうでもいい内容に限る

// 独り言/雑談 1 フレーズを 1 エントリにする省略記法。「大声で独り言を言う友達は
// 邪魔」問題への対策として、既定で bosoboso 55 + speed 90 のぼそぼそ小声に寄せる
// (再生音量も voice.svelte.js 側でチャッターだけ下げる)。個別指定は上書きマージ。
const mutter = (text, extra = {}) => [
	{ text, speed: 90, ...extra, emotion: { bosoboso: 55, ...(extra.emotion ?? {}) } }
];

export const workLines = {
	// タイマー開始
	start: [
		[{ text: 'んじゃ、始めよっか。' }],
		[{ text: 'はーい、作業会かいさーい。', speed: 98 }],
		[{ text: 'タイマー入れるよー。よーい、どん。' }],
		[{ text: 'わたしもこっちやるから、お互いがんばろ。', speed: 95 }],
		[{ text: '今日もゆるっとやってこー。', speed: 92 }]
	],
	// 作業終了 → 休憩入り
	breakStart: [
		[{ text: 'おつかれー、休憩休憩。', speed: 95 }],
		[{ text: 'はい、そこまでー。', speed: 95 }],
		[{ text: 'いったん手止めよ。お茶お茶。', speed: 94 }],
		[
			{ text: 'ふぅ、区切りだね。', speed: 90, pause: 300 },
			{ text: 'ちょっと休も。', speed: 92 }
		]
	],
	// 終了 (ユーザーがセッション中に終了ボタンを押したとき)
	end: [
		[{ text: '終わりー。おつかれさま。', emotion: { honwaka: 15 }, speed: 94 }],
		[
			{ text: 'はい、今日はここまで。', pause: 300 },
			{ text: 'ちゃんと寝なよー?', speed: 92 }
		],
		[{ text: 'おつかれ。わたしもキリついたし、のんびりしよ。', speed: 92 }]
	],
	// スリープ復帰などで遷移をまとめて消化したとき (現在の状態だけ一度案内)
	resume: [
		[{ text: 'あ、おかえり。タイマー進めといたよ。', speed: 92 }],
		[{ text: 'ん、戻った? 続きやろ。', speed: 92 }]
	],
	// 休憩明けの問いかけ (askNext)。時間帯別プールは pickAskLine が選ぶ
	askGeneric: [
		[{ text: '休憩おわりだけど、もう1セットやる?', speed: 94 }],
		[{ text: 'どうするー? 続ける?', speed: 92 }],
		[{ text: '作業おわった? まだいけそう?', speed: 92 }],
		[{ text: 'もうひと山いく? やめとく?', speed: 94 }]
	],
	// お昼は 12 時をまたいだかで言い回しを変える (11時台 = そろそろ / 12時台 = 出遅れ)
	askLunch: [
		[{ text: 'そろそろお昼だけど、ごはんどうする?', speed: 92 }],
		[{ text: 'お昼たべてからにする? それとももう1セット?', speed: 92 }]
	],
	askLunchLate: [
		[{ text: '出遅れ気味だけど、お昼どうする?', speed: 92 }],
		[{ text: 'もうお昼まわってるよ。ごはん食べた?', speed: 92 }]
	],
	askDinner: [
		[{ text: '夜ごはんどうする? 食べてからでもいいよ。', speed: 92 }],
		[{ text: 'そろそろ夕飯の時間じゃない? 続ける?', speed: 92 }]
	],
	askNight: [
		[{ text: 'もういい時間だよ? 今日は終わらない?', speed: 90 }],
		[{ text: 'もう夜だしさ、無理しないで終わっとく?', speed: 90 }]
	],
	// 作業中に漏れる独り言と、集中が切れたときのどうでもいい雑談 (チャッター)
	midWork: [
		// --- 思考中 ---
		mutter('ええと……。', { speed: 88 }),
		mutter('うーん……。', { speed: 86 }),
		mutter('あれ、なんだっけ……。'),
		mutter('えっと、どこまでやったっけ。'),
		mutter('んー……。', { speed: 85 }),
		mutter('はて……。', { speed: 88 }),
		mutter('そうじゃなくて……。'),
		mutter('こう、かな……。', { speed: 88 }),
		mutter('いや、違うな……。'),
		mutter('どうしよっかな……。', { speed: 90 }),
		mutter('まてよ……?'),
		mutter('こっちが先か……。'),
		mutter('ふむ……。', { speed: 86 }),
		mutter('なるほど……?'),
		mutter('なるほどね……。', { speed: 90 }),
		mutter('ちょっと整理しよ……。'),
		mutter('一回落ち着こう……。', { speed: 88 }),
		mutter('えー、なんでだろ。'),
		mutter('うーん、惜しい……。'),
		mutter('あとちょっとな気がする……。'),
		mutter('ここが噛み合わない……。'),
		mutter('順番が違うのかな……。'),
		mutter('もう一回読も……。', { speed: 90 }),
		mutter('お、つながってきた……。'),
		mutter('これ、前もやったような……。'),
		// --- 進捗・うまくいった ---
		mutter('よし、動いた!', { emotion: { doyaru: 20 }, speed: 100 }),
		mutter('できた……!', { emotion: { doyaru: 15 }, speed: 96 }),
		mutter('お、いい感じ。', { speed: 95 }),
		mutter('よしよし……。', { speed: 90 }),
		mutter('うん、これでいい。'),
		mutter('ふふ、天才かも。', { emotion: { doyaru: 25 }, speed: 96 }),
		mutter('順調順調……。', { speed: 94 }),
		mutter('あと少し……。'),
		mutter('ここまでは OK……。'),
		mutter('お、直った。', { speed: 96 }),
		mutter('うん、悪くない。'),
		mutter('よし、次。', { speed: 96 }),
		mutter('一個終わり……っと。'),
		mutter('えらいぞ、わたし。', { emotion: { doyaru: 20 }, speed: 95 }),
		mutter('お、そういうことか。', { speed: 96 }),
		mutter('見えてきた見えてきた。', { speed: 96 }),
		mutter('この調子この調子……。', { speed: 94 }),
		mutter('思ったより進んでるかも……。'),
		mutter('きれいにまとまった気がする。'),
		mutter('うん、読みやすい。'),
		// --- ミス・トラブル ---
		mutter('うわ、消しちゃった……。', { emotion: { teary: 20 }, speed: 95 }),
		mutter('あー……保存してない……。', { emotion: { teary: 25 }, speed: 90 }),
		mutter('あれ、動かない……。'),
		mutter('なんで!?', { emotion: { angry: 15 }, speed: 105 }),
		mutter('さっきまで動いてたのに……。', { emotion: { bosoboso: 30 } }),
		mutter('うそでしょ……。', { speed: 90 }),
		mutter('また誤字ってる……。', { emotion: { bosoboso: 25 } }),
		mutter('ここ違うじゃん……。'),
		mutter('はぁ、やり直し……。', { emotion: { bosoboso: 30 }, speed: 88 }),
		mutter('んん!?', { speed: 105 }),
		mutter('……見なかったことにしよ。', { speed: 90 }),
		mutter('おかしいなぁ……。'),
		mutter('誰だこれ書いたの……わたしだ。', { emotion: { bosoboso: 25 } }),
		mutter('落ち着け、わたし……。', { speed: 88 }),
		mutter('一文字違いかぁ……。', { emotion: { bosoboso: 20 } }),
		mutter('惜しいことしたな……。'),
		mutter('これは沼の気配……。', { emotion: { bosoboso: 30 }, speed: 90 }),
		mutter('うぅ、進まない……。', { emotion: { teary: 15 }, speed: 88 }),
		// --- 小休止・生活 ---
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
		// --- 実況ぎみの独り言 ---
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
		mutter('これは明日のわたしに任せた……。'),
		mutter('優先度は……こっちが先。'),
		mutter('見直し見直し……。', { speed: 94 }),
		mutter('答え合わせしよ……。'),
		mutter('うん、問題なし。', { speed: 95 }),
		mutter('ここ、名前どうしよ……。'),
		mutter('とりあえずやってみよ……。'),
		mutter('下書きでいいから書いちゃお……。'),
		mutter('一旦全部並べてみよ……。'),
		mutter('消すの怖いから残しとこ……。'),
		// --- 鼻歌・くせ ---
		mutter('ふんふん、ふーん……。', { speed: 88 }),
		mutter('ふんふんふーん……。', { speed: 88 }),
		mutter('たたたっと……。', { speed: 95 }),
		mutter('……っと。', { speed: 92 }),
		mutter('カタカタうるさくないかな、わたし……。', { emotion: { bosoboso: 25 } }),
		mutter('しーん、としてる……。', { emotion: { bosoboso: 20 }, speed: 90 }),
		mutter('集中してるなぁ……。', { emotion: { bosoboso: 20 }, speed: 90 }),
		mutter('わたしも負けてられない……。', { speed: 94 }),
		mutter('もくもく……。', { speed: 90 }),
		mutter('ん、いい時間の流れ……。', { speed: 88 }),
		// --- 集中が切れたときの、くっそどうでもいい雑談 (話しかけOK枠) ---
		mutter('ねえ聞いて。今日の購買、焼きそばパン一瞬で消えた。', { speed: 96 }),
		mutter('新作のアイス、結局まだ食べてないんだよね……。', { speed: 94 }),
		mutter('数学の小テスト、ノー勉でいくか迷ってる……。', { speed: 94 }),
		mutter('前髪切りすぎた話、聞く? ……やっぱいい。', { speed: 94 }),
		mutter('自販機のいちごオレ、売り切れてたんだけど。', { speed: 96 }),
		mutter('消しゴム落とした。今日3回目。', { speed: 94 }),
		mutter('スマホ見たら負けだと思ってる、今は。', { speed: 94 }),
		mutter('明日って体育あったっけ……あったら嫌だな。', { speed: 92 }),
		mutter('シャー芯、さっき全部折れた。どうでもいいけど。', { speed: 94 }),
		mutter('ねー、集中してる? ……してるか。ごめん。', { speed: 92 }),
		mutter('試験終わったらどっか行こうね。', { emotion: { honwaka: 15 }, speed: 94 }),
		mutter('眠くなってきたかも……あと10分がんばる。', { speed: 88 }),
		mutter('隣の家の犬、今日もずっと鳴いてる。', { speed: 92 }),
		mutter('靴下、左右違うの履いてた。誰も見てないからセーフ。', { speed: 94 }),
		mutter('今日の夕焼け、すごかったんだけど。見た?', { speed: 94 })
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
