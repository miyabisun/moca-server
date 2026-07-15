// 作業タブの声かけ。台本プレイヤー (player.svelte.js) とは完全に独立した
// 専用 Audio + 直列 FIFO (NotifySubscribe.svelte の drain パターン)。
// enqueue するのはテキストでなく script JSON — 感情付き固定セリフを
// POST /say して blob 再生する。VOICEPEAK 側は SynthQueue が直列化するので
// 台本再生と重なっても合成は壊れない (音は重なりうる — 通知と同じ扱い)。
//
// タイマーの節目購読はモジュール初期化時に 1 回だけ (タブ往復で重複しない)。
// OFF 時は FIFO クリア + in-flight fetch 中断 + 再生停止。

import { sayScriptRequest, workTalk } from '$lib/api.js';
import { onTransition, timer } from '$lib/work/timer.svelte.js';
import { pickAskLine, pickLine } from '$lib/work/lines.js';
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

function loadChatter() {
	try {
		const v = localStorage.getItem(CHATTER_KEY);
		return v === 'off' || v === 'sparse' ? v : 'normal';
	} catch {
		return 'normal';
	}
}

let speaking = $state(false); // 再生中フラグ (WorkPortrait の口パクが購読する)
let currentScript = $state(null); // 再生中の script JSON (表情選択が感情サマリに使う)
let chatter = $state(loadChatter()); // 'normal' | 'sparse' | 'off'

let audio = null; // 専用 HTMLAudioElement (line-player とは別)
let objectUrl = null;
let queue = [];
let playing = false;
let controller = null; // in-flight の /say fetch

function revoke() {
	if (objectUrl) {
		URL.revokeObjectURL(objectUrl);
		objectUrl = null;
	}
}

async function drain() {
	if (playing) return;
	const entry = queue.shift();
	if (entry == null) return;
	const { script, volume } = entry;
	playing = true;
	try {
		controller = new AbortController();
		const res = await fetch('/say', {
			...sayScriptRequest(script),
			signal: controller.signal
		});
		if (!res.ok) throw new Error(`/say ${res.status}`);
		const blob = await res.blob();
		revoke();
		objectUrl = URL.createObjectURL(blob);
		audio ??= new Audio();
		audio.src = objectUrl;
		audio.volume = volume;
		currentScript = script;
		speaking = true;
		await new Promise((resolve) => {
			audio.onended = resolve;
			audio.onerror = resolve;
			audio.play().catch(resolve);
		});
	} catch {
		// fire-and-forget: 失敗は握りつぶして次のセリフへ
	} finally {
		controller = null;
		speaking = false;
		currentScript = null;
		revoke();
		playing = false;
		if (queue.length) drain();
	}
}

// script JSON を直接キューに積む。節目・チャッター・LLM 生成すべてこの 1 本を通る。
// volume は再生時の Audio.volume (独り言 = MUTTER_VOLUME、節目 = 等倍)。
export function speakScript(script, volume = 1) {
	if (!script) return;
	queue.push({ script, volume });
	drain();
}

export function speakCategory(category, volume = 1) {
	speakScript(pickLine(category), volume);
}

// LLM で一言生成して喋る。失敗・20 秒超過は固定セリフ (fallbackCategory) に
// フォールバック。in-flight 中の再発行はしない (1-flight ガード — 連打で CLI を
// 積み上げない)。OFF 切替は generation で無効化し fetch も中断する。
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
	try {
		const context = {
			phase: timer.phase,
			hour: new Date().getHours()
		};
		const script = await workTalk(kind, context, llmController.signal);
		speakScript(script, volume);
	} catch {
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
	// たまに時事ネタ (AI 界隈・流行りのゲーム) を LLM で拾ってきて喋る。
	// 独り言・雑談は音量を絞る (大声の独り言は邪魔)。
	if (Math.random() < NEWS_PROBABILITY) speakGenerated('news', 'midWork', MUTTER_VOLUME);
	else speakCategory('midWork', MUTTER_VOLUME);
	armChatter();
}

// --- 節目の配線 (モジュールスコープで 1 回だけ) ---
const CATEGORY_BY_EVENT = {
	start: 'start',
	breakStart: 'breakStart',
	end: 'end',
	resync: 'resume'
};

onTransition((event) => {
	if (event === 'askNext') {
		// 休憩明けの問いかけは時間帯で固定セリフを選ぶ (LLM は挟まない —
		// 「どうする?」はユーザーの返答を待つ確実な合図なので言い回しをブレさせない)。
		speakScript(pickAskLine(new Date().getHours()));
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
