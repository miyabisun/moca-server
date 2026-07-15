// ポモドーロ状態機械。player.svelte.js と同じモジュールスコープ rune 流儀:
// コンポーネント寿命に縛られないので、タブを離れてもタイマーは進み続ける。
//
// セット数という概念は持たない (ユーザー確定)。1 セット = 作業 → 休憩 で必ず
// 止まり、休憩明けに askNext イベントを発火してモカが「もう1セットやる?」と
// 聞いてくる。続けるかどうかは毎回ユーザーが開始ボタンで決める。
//
// 残り時間はデクリメントせず「期限 (Date.now() + ms)」を持ち、setInterval で
// 導出する (NotifySubscribe の sleep 検出と同思想)。タブのスロットリングや
// マシンのスリープで tick が止まっても、復帰時に期限超過分の遷移をまとめて
// 消化する — そのとき節目イベントは溜め撃ちせず 'resync' 1 回に潰す。
// Date.now() はこのモジュールに集約してあり、Playwright の page.clock で
// そのままフェイクできる。

const STORAGE_KEY = 'moca-work-timer';

const DEFAULTS = { workMin: 25, breakMin: 5 };

function loadSettings() {
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
		return {
			workMin: clampInt(raw?.workMin, 1, 180, DEFAULTS.workMin),
			breakMin: clampInt(raw?.breakMin, 1, 60, DEFAULTS.breakMin)
		};
	} catch {
		return { ...DEFAULTS };
	}
}

function clampInt(v, min, max, fallback) {
	const n = Math.round(Number(v));
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

let phase = $state('idle'); // 'idle' | 'work' | 'break'
let running = $state(false);
// 休憩明けの「どうする?」中。パネルの文言と開始ボタンの意味が変わる。
let asking = $state(false);
let remainingMs = $state(0);
let phaseTotalMs = $state(0);
let settings = $state(loadSettings());

let phaseEndsAt = 0; // 現在フェーズの期限 (epoch ms)。表示は remainingMs 経由。
let pausedRemaining = null; // 一時停止中の残り ms
let interval = null;

// 節目イベント: 'start' | 'breakStart' | 'askNext' | 'end' | 'resync'。
// 購読はモジュール初期化時に 1 回だけ行う想定 (解除 API は意図的に無い —
// コンポーネントから購読するとタブ往復で重複するため禁止)。
const listeners = [];

export function onTransition(cb) {
	listeners.push(cb);
}

function emit(event) {
	for (const cb of listeners) cb(event);
}

function durationMs(p) {
	return (p === 'work' ? settings.workMin : settings.breakMin) * 60_000;
}

function enterPhase(p, endsAt) {
	phase = p;
	phaseTotalMs = durationMs(p);
	phaseEndsAt = endsAt ?? Date.now() + phaseTotalMs;
	remainingMs = Math.max(0, phaseEndsAt - Date.now());
}

function startTicking() {
	if (interval == null) interval = setInterval(tick, 1000);
}

function stopTicking() {
	if (interval != null) {
		clearInterval(interval);
		interval = null;
	}
}

// 休憩明け: タイマーを止めて「どうする?」状態で待つ。
function stopForAsk() {
	running = false;
	phase = 'idle';
	asking = true;
	remainingMs = 0;
	phaseTotalMs = 0;
	stopTicking();
}

// 期限超過分の遷移を全て消化する。通常 tick では高々 1 回だが、スリープ復帰では
// 複数回まわる。消化した節目イベントは配列に集め、呼び出し元で 1 件なら通常発火、
// 複数なら 'resync' に潰す。
function advanceOverdue() {
	const events = [];
	while (running && Date.now() >= phaseEndsAt) {
		if (phase === 'work') {
			enterPhase('break', phaseEndsAt + durationMs('break'));
			events.push('breakStart');
		} else {
			stopForAsk();
			events.push('askNext');
		}
	}
	return events;
}

function tick() {
	if (!running) return;
	const events = advanceOverdue();
	if (running) remainingMs = Math.max(0, phaseEndsAt - Date.now());
	if (events.length === 1) emit(events[0]);
	else if (events.length > 1) {
		// 複数遷移は resync に潰すが、最終状態が「どうする?」(asking) のときだけは
		// askNext を優先する — UI が問いかけ表示なのに音声が「続きやろ」では食い違う。
		// 問いかけセリフ自体が「おかえり + 意思確認」を兼ねる。
		emit(events.at(-1) === 'askNext' ? 'askNext' : 'resync');
	}
}

// idle から開始 (もう1セットを含む) / 一時停止から再開。
export function start() {
	if (running) return;
	if (phase === 'idle') {
		asking = false;
		running = true;
		enterPhase('work');
		startTicking();
		emit('start');
	} else {
		running = true;
		phaseEndsAt = Date.now() + (pausedRemaining ?? remainingMs);
		pausedRemaining = null;
		remainingMs = Math.max(0, phaseEndsAt - Date.now());
		startTicking();
	}
}

export function pause() {
	if (!running) return;
	running = false;
	pausedRemaining = Math.max(0, phaseEndsAt - Date.now());
	remainingMs = pausedRemaining;
	stopTicking();
}

// 終了。セッション中 (作業/休憩/どうする?) からの終了は 'end' でおつかれ様を言う。
export function reset() {
	const wasActive = phase !== 'idle' || asking;
	running = false;
	phase = 'idle';
	asking = false;
	remainingMs = 0;
	phaseTotalMs = 0;
	pausedRemaining = null;
	stopTicking();
	if (wasActive) emit('end');
}

// 設定変更は次のフェーズから効く (実行中フェーズの期限は動かさない)。
export function updateSettings(patch) {
	settings = {
		workMin: clampInt(patch.workMin ?? settings.workMin, 1, 180, settings.workMin),
		breakMin: clampInt(patch.breakMin ?? settings.breakMin, 1, 60, settings.breakMin)
	};
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// プライベートモード等で保存できなくても動作は継続する
	}
}

export const timer = {
	get phase() {
		return phase;
	},
	get running() {
		return running;
	},
	get asking() {
		return asking;
	},
	get remainingMs() {
		return remainingMs;
	},
	get phaseTotalMs() {
		return phaseTotalMs;
	},
	get settings() {
		return settings;
	}
};
