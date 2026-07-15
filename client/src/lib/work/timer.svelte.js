// ポモドーロ状態機械。player.svelte.js と同じモジュールスコープ rune 流儀:
// コンポーネント寿命に縛られないので、タブを離れてもタイマーは進み続ける。
//
// 残り時間はデクリメントせず「期限 (Date.now() + ms)」を持ち、setInterval で
// 導出する (NotifySubscribe の sleep 検出と同思想)。タブのスロットリングや
// マシンのスリープで tick が止まっても、復帰時に期限超過分の遷移をまとめて
// 消化する — そのとき節目イベントは溜め撃ちせず 'resync' 1 回に潰す
// (docs/DESIGN.md 予定: 作業タブ)。Date.now() はこのモジュールに集約してあり、
// Playwright の page.clock でそのままフェイクできる。

const STORAGE_KEY = 'moca-work-timer';

const DEFAULTS = { workMin: 25, breakMin: 5, sets: 1 };

function loadSettings() {
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
		return {
			workMin: clampInt(raw?.workMin, 1, 180, DEFAULTS.workMin),
			breakMin: clampInt(raw?.breakMin, 1, 60, DEFAULTS.breakMin),
			sets: clampInt(raw?.sets, 1, 12, DEFAULTS.sets)
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
let setIndex = $state(0); // 実行中の何セット目か (1 始まり; idle では 0)
let remainingMs = $state(0);
let phaseTotalMs = $state(0);
let settings = $state(loadSettings());

let phaseEndsAt = 0; // 現在フェーズの期限 (epoch ms)。表示は remainingMs 経由。
let pausedRemaining = null; // 一時停止中の残り ms
let interval = null;

// 節目イベント: 'start' | 'breakStart' | 'breakEnd' | 'allDone' | 'resync'。
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

// 期限超過分の遷移を全て消化する。通常 tick では高々 1 回だが、スリープ復帰では
// 複数回まわる。消化した節目イベントは配列に集め、呼び出し元で 1 件なら通常発火、
// 複数なら 'resync' に潰す (最後が allDone のときだけ allDone を優先)。
function finish() {
	running = false;
	setIndex = 0;
	phase = 'idle';
	remainingMs = 0;
	phaseTotalMs = 0;
	stopTicking();
}

function advanceOverdue() {
	const events = [];
	while (running && Date.now() >= phaseEndsAt) {
		if (phase === 'work') {
			if (setIndex >= settings.sets) {
				finish();
				events.push('allDone');
			} else {
				enterPhase('break', phaseEndsAt + durationMs('break'));
				events.push('breakStart');
			}
		} else if (setIndex >= settings.sets) {
			// 休憩中にセット数を減らされた場合も、余分な作業セットへ進まず完了する
			// (work 終了時と対称の判定)。
			finish();
			events.push('allDone');
		} else {
			setIndex += 1;
			enterPhase('work', phaseEndsAt + durationMs('work'));
			events.push('breakEnd');
		}
	}
	return events;
}

function tick() {
	if (!running) return;
	const events = advanceOverdue();
	if (running) remainingMs = Math.max(0, phaseEndsAt - Date.now());
	if (events.length === 1) emit(events[0]);
	else if (events.length > 1) emit(events.at(-1) === 'allDone' ? 'allDone' : 'resync');
}

// idle から開始 / 一時停止から再開。節目イベント 'start' は新規開始のみ。
export function start() {
	if (running) return;
	if (phase === 'idle') {
		setIndex = 1;
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

export function reset() {
	running = false;
	phase = 'idle';
	setIndex = 0;
	remainingMs = 0;
	phaseTotalMs = 0;
	pausedRemaining = null;
	stopTicking();
}

// 設定変更は次のフェーズから効く (実行中フェーズの期限は動かさない)。
export function updateSettings(patch) {
	settings = {
		workMin: clampInt(patch.workMin ?? settings.workMin, 1, 180, settings.workMin),
		breakMin: clampInt(patch.breakMin ?? settings.breakMin, 1, 60, settings.breakMin),
		sets: clampInt(patch.sets ?? settings.sets, 1, 12, settings.sets)
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
	get setIndex() {
		return setIndex;
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
