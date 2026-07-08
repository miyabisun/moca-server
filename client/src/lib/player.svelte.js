import { sayTextUrl, sayScriptRequest } from '$lib/api.js';

// Single global audio player. Two ways to start: a single line (play) or a
// whole-project listen-through (playAll, "radio"). Exactly one line sounds at a
// time and the two modes are mutually exclusive — starting either stops the
// other (DESIGN.md). Audio is never stored: every play streams a fresh /say
// synthesis. Acting lines POST the script JSON and play the resulting blob;
// announcer lines stream directly via a GET src.
let playingId = $state(null);
let loadingId = $state(null);
let spinnerId = $state(null); // set only after 300ms of loading
let radioProjectId = $state(null); // project currently playing through as radio

let queue = null; // ordered lines for the active radio run
let queueIndex = 0;

let audio = null;
let objectUrl = null;
let spinnerTimer = null;
let token = 0; // guards against races when switching lines quickly

function ensureAudio() {
	if (audio) return audio;
	audio = new Audio();
	audio.addEventListener('playing', () => {
		loadingId = null;
		clearSpinnerTimer();
		spinnerId = null;
	});
	audio.addEventListener('ended', onEnded);
	audio.addEventListener('error', reset);
	return audio;
}

function clearSpinnerTimer() {
	if (spinnerTimer) {
		clearTimeout(spinnerTimer);
		spinnerTimer = null;
	}
}

function revoke() {
	if (objectUrl) {
		URL.revokeObjectURL(objectUrl);
		objectUrl = null;
	}
}

function reset() {
	playingId = null;
	loadingId = null;
	spinnerId = null;
	clearSpinnerTimer();
	queue = null;
	queueIndex = 0;
	radioProjectId = null;
}

// During a radio run, advance to the next line instead of resetting; otherwise
// (single line, or last line of the run) stop.
function onEnded() {
	if (queue && queueIndex + 1 < queue.length) {
		queueIndex++;
		startLine(queue[queueIndex]).catch(() => stop());
	} else {
		stop();
	}
}

export function stop() {
	token++;
	if (audio) {
		audio.pause();
		audio.removeAttribute('src');
		audio.load();
	}
	revoke();
	reset();
}

// Synthesize and play one line. Does not touch the queue/radio state, so it is
// reused both for single play and for each leg of a radio run.
async function startLine(line) {
	const my = ++token;
	const el = ensureAudio();
	loadingId = line.id;
	clearSpinnerTimer();
	spinnerTimer = setTimeout(() => {
		if (loadingId === line.id) spinnerId = line.id;
	}, 300);

	try {
		if (line.mode === 'acting' && line.script) {
			// POST script JSON, play the streamed blob.
			const res = await fetch('/say', sayScriptRequest(line.script));
			if (my !== token) return; // superseded
			if (!res.ok) throw new Error(`${res.status}`);
			revoke();
			objectUrl = URL.createObjectURL(await res.blob());
			if (my !== token) return;
			el.src = objectUrl;
		} else {
			el.src = sayTextUrl(line.text, line.raw);
		}
		playingId = line.id;
		await el.play();
	} catch (e) {
		// A superseded attempt's failure (e.g. its play() promise rejecting after
		// stop() yanked the src) must not bubble up and kill the current playback.
		if (my !== token) return;
		reset();
		throw e;
	}
}

export async function play(line) {
	// Toggle off if the same line is already active.
	if (playingId === line.id || loadingId === line.id) {
		stop();
		return;
	}
	stop(); // cancels any single play or radio run in progress
	await startLine(line);
}

// Play a whole project's lines in order like radio. Tapping the same project
// again stops it; starting a run cancels any single play or other run.
export function playAll(projectId, lines) {
	if (radioProjectId === projectId) {
		stop();
		return;
	}
	stop();
	if (!lines || lines.length === 0) return;
	queue = lines;
	queueIndex = 0;
	radioProjectId = projectId;
	startLine(lines[0]).catch(() => stop());
}

export const player = {
	get playingId() {
		return playingId;
	},
	get loadingId() {
		return loadingId;
	},
	get spinnerId() {
		return spinnerId;
	},
	get radioProjectId() {
		return radioProjectId;
	}
};
