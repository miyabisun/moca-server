// 作業タブの声かけと表情演出。台本プレイヤー (player.svelte.js) とは完全に独立した
// 専用 Audio + 直列 FIFO (NotifySubscribe.svelte の drain パターン)。
// キューは「セリフ ({script, eye, volume})」「待ち ({waitMs, eye})」
// 「口元ムード ({mood})」の 3 種を直列に演じる小さな演出エンジンで、
// 目を閉じて 8 秒余韻をもたせる、といった台本シーケンスを表現する。
// expression (目元) と moodMouth (口元) は WorkPortrait が購読する。
//
// VOICEPEAK 側は SynthQueue が直列化するので台本再生と重なっても合成は壊れない
// (音は重なりうる — 通知と同じ扱い)。タイマーの節目購読はモジュール初期化時に
// 1 回だけ (タブ往復で重複しない)。

import { sayScriptRequest, workTalk } from '$lib/api.js';
import { onTransition, timer } from '$lib/work/timer.svelte.js';
import { performances, pickAskLine, pickLine } from '$lib/work/lines.js';
import { player } from '$lib/player.svelte.js';

// LLM 生成を混ぜる確率とクライアント側の見切り時間。20 秒返らなければ固定セリフに
// 切り替える (CLI プロセスの後始末はサーバの timeout + kill_on_drop が受け持つ)。
const LLM_PROBABILITY = 0.25;
const LLM_TIMEOUT_MS = 20_000;

const CHATTER_KEY = 'moca-work-chatter';
// 作業中チャッターの頻度 (分のレンジ)。'off' で無効。
// 「いらん事してる感」を出すため高頻度 (ユーザー確定: ふつう 1〜1.5分)。
const CHATTER_RANGES = { normal: [1, 1.5], sparse: [5, 10] };
// チャッターの再生音量。独り言は大声だと邪魔なので絞る (節目は等倍)。
const MUTTER_VOLUME = 0.45;
// チャッターに時事ネタ (LLM) を混ぜる確率。間隔が 1 分台と短いので低めにして、
// LLM 呼び出しを 10 分に 1 回程度に抑える (節目の LLM_PROBABILITY とは別)。
const NEWS_PROBABILITY = 0.1;
// チャッターが単発でなく台本シーケンス (目を閉じて余韻→復帰) になる確率。
const PERFORMANCE_PROBABILITY = 0.2;

function loadChatter() {
	try {
		const v = localStorage.getItem(CHATTER_KEY);
		return v === 'off' || v === 'sparse' ? v : 'normal';
	} catch {
		return 'normal';
	}
}

let speaking = $state(false); // 再生中フラグ (WorkPortrait の口パクが購読する)
let currentScript = $state(null); // 再生中の script JSON
let expression = $state(null); // セリフ/演出中の目元セット (null = アイドル顔)
let moodMouth = $state(null); // 演出後に残す口元 (例: ドヤ余韻の nikkori)
let chatter = $state(loadChatter()); // 'normal' | 'sparse' | 'off'

let audio = null; // 専用 HTMLAudioElement (line-player とは別)
let objectUrl = null;
let queue = [];
let playing = false;
let controller = null; // in-flight の /say fetch
let moodTimer = null;
// タイマーの節目は進行中の演出 (待ち・キュー・再生・LLM) を打ち切って上書きする。
// 世代番号の不一致で旧世代のエントリと遅延 LLM 応答を捨てる (player.svelte.js の
// token と同じ発想)。resolver は進行中の待ち/再生を即座に起こすためのもの。
let gen = 0;
let wakeWait = null;
let wakeAudio = null;

function revoke() {
	if (objectUrl) {
		URL.revokeObjectURL(objectUrl);
		objectUrl = null;
	}
}

function clearMood() {
	if (moodTimer != null) clearTimeout(moodTimer);
	moodTimer = null;
	moodMouth = null;
}

function setMood(mood) {
	clearMood();
	moodMouth = mood.mouth;
	moodTimer = setTimeout(() => (moodMouth = null), mood.ms);
}

// 進行中・待機中の演出をすべて打ち切る (節目イベントの直前に呼ぶ)。
function cancelPending() {
	gen += 1;
	queue = [];
	controller?.abort();
	llmController?.abort();
	audio?.pause();
	wakeAudio?.();
	wakeWait?.();
	clearMood();
	expression = null;
}

async function playScript(entry) {
	try {
		controller = new AbortController();
		const res = await fetch('/say', {
			...sayScriptRequest(entry.script),
			signal: controller.signal
		});
		if (!res.ok) throw new Error(`/say ${res.status}`);
		const blob = await res.blob();
		if (entry.gen !== gen) return; // 合成中に打ち切られた
		revoke();
		objectUrl = URL.createObjectURL(blob);
		audio ??= new Audio();
		audio.src = objectUrl;
		audio.volume = entry.volume ?? 1;
		currentScript = entry.script;
		await new Promise((resolve) => {
			wakeAudio = resolve;
			// 口パク (speaking) と表情は「実際に音が出始めた瞬間」(playing イベント)
			// まで遅延させる。play() 呼び出し時点で立てるとデコードや出力遅延の分だけ
			// 口が先に動いてしまう (ユーザー指摘)。
			audio.onplaying = () => {
				expression = entry.eye ?? null;
				speaking = true;
			};
			audio.onended = resolve;
			audio.onerror = resolve;
			audio.play().catch(resolve);
		});
	} catch {
		// fire-and-forget: 失敗は握りつぶして次のセリフへ
	} finally {
		if (audio) audio.onplaying = null;
		wakeAudio = null;
		controller = null;
		speaking = false;
		currentScript = null;
		// 表情はセリフと共に終わる。次のエントリ (ホールドの目閉じ等) は同期的に
		// 直後へ続くので、残留させると次セリフの合成待ちに前の顔が残ってしまう。
		expression = null;
		revoke();
	}
}

// キューを直列に演じる。旧世代のエントリは捨てる。
async function drain() {
	if (playing) return;
	playing = true;
	try {
		while (queue.length) {
			const entry = queue.shift();
			if (entry.gen !== gen) continue;
			if (entry.waitMs != null) {
				if (entry.eye !== undefined) expression = entry.eye;
				let timer = null;
				await new Promise((resolve) => {
					wakeWait = resolve;
					timer = setTimeout(resolve, entry.waitMs);
				});
				wakeWait = null;
				clearTimeout(timer);
				if (entry.gen !== gen) expression = null; // 打ち切られたホールドは顔も戻す
			} else if (entry.mood) {
				setMood(entry.mood);
			} else {
				await playScript(entry);
			}
		}
	} finally {
		playing = false;
	}
}

// script JSON を直接キューに積む。節目・チャッター・LLM 生成すべてこの 1 本を通る。
// volume は再生時の Audio.volume (独り言 = MUTTER_VOLUME、節目 = 等倍)。
export function speakScript(script, volume = 1, eye = null) {
	if (!script) return;
	queue.push({ script, volume, eye, gen });
	drain();
}

// lines.js のエントリ ({eye, script}) をそのまま喋る。
function speakEntry(entry, volume = 1) {
	if (!entry) return;
	speakScript(entry.script, volume, entry.eye);
}

export function speakCategory(category, volume = 1) {
	speakEntry(pickLine(category), volume);
}

// 台本シーケンス: opener → 目を閉じてホールド → closer → 口元ムード。
// 全ステップを一括で積むので、途中に別のセリフが割り込むことはない。
function performSequence(perf, volume = MUTTER_VOLUME) {
	const opener = perf.openers[Math.floor(Math.random() * perf.openers.length)];
	queue.push({ script: opener.script, eye: opener.eye, volume, gen });
	queue.push({ waitMs: perf.hold.ms, eye: perf.hold.eye, gen });
	if (perf.closer) queue.push({ script: perf.closer.script, eye: perf.closer.eye, volume, gen });
	if (perf.mood) queue.push({ mood: perf.mood, gen });
	drain();
}

// 休憩入りの台本 (ユーザー確定): 「はい、そこまで」→ 5 秒 → 目を閉じて
// 「うぅ、疲れたぁ……」。休憩中のアイドル顔は 001 (こちらを見る)。
function performBreakStart() {
	const opener = pickLine('breakStart');
	const tired = pickLine('breakTired');
	queue.push({ script: opener.script, eye: opener.eye, volume: 1, gen });
	queue.push({ waitMs: 5_000, eye: 'normal', gen });
	queue.push({ script: tired.script, eye: tired.eye, volume: 1, gen });
	drain();
}

// LLM で一言生成して喋る。失敗・20 秒超過は固定セリフ (fallbackCategory) に
// フォールバック。生成セリフは「話しかけ」なので目は 001=normal。in-flight 中の
// 再発行はしない (1-flight ガード — 連打で CLI を積み上げない)。
let llmInFlight = false;
let llmController = null;

async function speakGenerated(kind, fallbackCategory, volume = 1) {
	if (llmInFlight) {
		speakCategory(fallbackCategory, volume);
		return;
	}
	llmInFlight = true;
	llmController = new AbortController();
	const deadline = setTimeout(() => llmController?.abort(), LLM_TIMEOUT_MS);
	const myGen = gen; // 応答が返る前に節目が変わったら、結果もフォールバックも捨てる
	try {
		const context = {
			phase: timer.phase,
			hour: new Date().getHours()
		};
		const script = await workTalk(kind, context, llmController.signal);
		if (myGen !== gen) return;
		speakScript(script, volume, 'normal');
	} catch {
		if (myGen !== gen) return;
		speakCategory(fallbackCategory, volume);
	} finally {
		clearTimeout(deadline);
		llmController = null;
		llmInFlight = false;
	}
}

// 声かけは常時 ON (ユーザー確定: OFF がデフォルトなら普通のポモドーロと変わらない。
// 消したければ「おしゃべり: なし」で足りる)。autoplay の解錠だけはユーザー
// ジェスチャが必要なので、開始ボタンのクリックハンドラから同期的に呼んでもらう
// (NotifySubscribe.subscribe と同じ理由)。
export function unlock() {
	new Audio().play().catch(() => {});
}

export function setChatter(mode) {
	chatter = mode === 'off' || mode === 'sparse' ? mode : 'normal';
	try {
		localStorage.setItem(CHATTER_KEY, chatter);
	} catch {
		// 保存できなくても動作は継続する
	}
	// 予約済みタイマーにも即時反映する (off なら破棄、それ以外は引き直し)。
	if (timer.phase === 'work' && timer.running) armChatter();
	else clearChatterTimer();
}

export const voice = {
	get speaking() {
		return speaking;
	},
	get currentScript() {
		return currentScript;
	},
	get expression() {
		return expression;
	},
	get moodMouth() {
		return moodMouth;
	},
	get chatter() {
		return chatter;
	}
};

// --- 作業中チャッター ---
// work フェーズ突入時に「次の一言」を setTimeout 1 本だけ予約する (interval は
// 使わない)。発火時に条件を満たさなければ喋らずに対応する再予約だけ行う:
// 一時停止中 (phase は work のまま) は再予約、idle まで落ちていたら破棄 —
// 次の start が改めて予約する。台本再生中は遠慮して 90 秒後に出直す。
let chatterTimer = null;

function clearChatterTimer() {
	if (chatterTimer != null) {
		clearTimeout(chatterTimer);
		chatterTimer = null;
	}
}

function armChatter(delayMs = null) {
	clearChatterTimer();
	if (chatter === 'off') return;
	if (delayMs == null) {
		const [lo, hi] = CHATTER_RANGES[chatter];
		delayMs = (lo + Math.random() * (hi - lo)) * 60_000;
	}
	chatterTimer = setTimeout(fireChatter, delayMs);
}

function fireChatter() {
	chatterTimer = null;
	if (timer.phase !== 'work') return; // idle まで落ちていた: 次の節目に任せる
	if (!timer.running) {
		armChatter(); // 一時停止中: 喋らず引き直す
		return;
	}
	if (player.playingId != null || player.radioProjectId != null) {
		armChatter(90_000); // 台本の試聴・ラジオ中は割り込まない
		return;
	}
	// 単発の独り言を基本に、たまに時事ネタ (LLM) か台本シーケンスを混ぜる。
	// 独り言・雑談は音量を絞る (大声の独り言は邪魔)。
	const r = Math.random();
	if (r < NEWS_PROBABILITY) speakGenerated('news', 'midWork', MUTTER_VOLUME);
	else if (r < NEWS_PROBABILITY + PERFORMANCE_PROBABILITY)
		performSequence(performances[Math.floor(Math.random() * performances.length)]);
	else speakCategory('midWork', MUTTER_VOLUME);
	armChatter();
}

// --- 節目の配線 (モジュールスコープで 1 回だけ) ---
const CATEGORY_BY_EVENT = {
	start: 'start',
	end: 'end',
	resync: 'resume'
};

onTransition((event) => {
	// 節目は進行中の演出 (旧シーケンスの待ち・キュー・遅延 LLM) を必ず上書きする。
	cancelPending();
	if (event === 'askNext') {
		// 休憩明けの問いかけは時間帯で固定セリフを選ぶ (LLM は挟まない —
		// 「どうする?」はユーザーの返答を待つ確実な合図なので言い回しをブレさせない)。
		speakEntry(pickAskLine(new Date().getHours()));
	} else if (event === 'breakStart') {
		// 休憩入りは固定の台本シーケンス (そこまで → 5 秒 → 目を閉じて疲れた)。
		performBreakStart();
	} else {
		const category = CATEGORY_BY_EVENT[event];
		if (category) {
			// 節目もたまに LLM 生成でバリエーションを出す (失敗は固定セリフ)。
			if (Math.random() < LLM_PROBABILITY) speakGenerated('milestone', category);
			else speakCategory(category);
		}
	}
	// チャッターの予約は「いまどのフェーズにいるか」だけで決める。
	if (timer.phase === 'work' && timer.running) armChatter();
	else clearChatterTimer();
});
