import { sayTextUrl, sayScriptRequest } from '$lib/api.js';

// Single global audio player: exactly one line plays at a time. Starting a new
// line stops the previous one (DESIGN.md). Audio is never stored — every play
// streams a fresh synthesis from /say. Acting lines POST the script JSON and
// play the resulting blob; announcer lines stream directly via a GET src.
let playingId = $state(null);
let loadingId = $state(null);
let spinnerId = $state(null); // set only after 300ms of loading

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
	audio.addEventListener('ended', reset);
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

export async function play(line) {
	// Toggle off if the same line is already active.
	if (playingId === line.id || loadingId === line.id) {
		stop();
		return;
	}
	stop();
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
			el.src = sayTextUrl(line.text);
		}
		playingId = line.id;
		await el.play();
	} catch (e) {
		if (my === token) reset();
		throw e;
	}
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
	}
};
