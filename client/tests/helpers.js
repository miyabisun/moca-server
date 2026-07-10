// Stateful in-memory backend mock for the E2E suite. Every test installs it via
// installApi(page, ...) so all /api, /analyze, /say and /notify traffic is served
// from an in-process store — the Rust server and VOICEPEAK are never touched.
//
// The store is stateful (not fixed fulfill) on purpose: the vim paste/delete
// flows in App.svelte run POST/DELETE/PUT and then re-GET the detail, and their
// cursor-follow / paste-restore behaviour depends on that GET reflecting the
// mutation. So writes mutate the store and GET /api/projects/:id serializes it.

import { Buffer } from 'node:buffer';

let idSeq = 0;
const nextId = (prefix) => `${prefix}_${++idSeq}`;

// A valid WAV blob of `seconds` of silence (8kHz mono 16-bit PCM). The default
// /say mock body is empty, which makes el.play() reject/end instantly — unusable
// for observing the playing indicator. A real, non-trivial clip lets play()
// resolve and the indicator stay visible for the clip's duration.
export function silentWav(seconds = 3) {
	const sampleRate = 8000;
	const numSamples = sampleRate * seconds;
	const dataSize = numSamples * 2;
	const buf = Buffer.alloc(44 + dataSize);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + dataSize, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20); // PCM
	buf.writeUInt16LE(1, 22); // mono
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
	buf.writeUInt16LE(2, 32); // block align
	buf.writeUInt16LE(16, 34); // bits per sample
	buf.write('data', 36);
	buf.writeUInt32LE(dataSize, 40);
	return buf; // samples default to zero (silence)
}

// Factory: a line with the server's field shape.
export function line(mode, text, { id, script = null } = {}) {
	return { id: id ?? nextId('l'), mode, text, script };
}

// Factory: a project. `lines` are ordered; position is derived from the index.
export function project(name, lines = [], { id } = {}) {
	return {
		id: id ?? nextId('p'),
		name,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		lines
	};
}

function serializeList(store) {
	return store.projects.map((p) => ({
		id: p.id,
		name: p.name,
		created_at: p.created_at,
		updated_at: p.updated_at,
		lineCount: p.lines.length
	}));
}

function serializeDetail(p) {
	return {
		id: p.id,
		name: p.name,
		created_at: p.created_at,
		updated_at: p.updated_at,
		lines: p.lines.map((l, i) => ({
			id: l.id,
			project_id: p.id,
			position: i,
			mode: l.mode,
			text: l.text,
			script: l.script
		}))
	};
}

const jsonBody = (data) => ({
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify(data)
});

// Install the mock. Returns { store, requests }:
// - store.projects is the mutable backend state (tests can read it back).
// - requests is an ordered log of every intercepted call: { method, path, json, text }.
// `analyzeResult` is the fixed script array returned by /analyze.
// `sayAudio` (optional Buffer): when set, /say returns it as audio/wav instead of
// the default empty audio/mpeg body — needed by the play/stop test (see silentWav).
export async function installApi(
	page,
	{ projects = [], analyzeResult = [{ happy: 0 }], sayAudio = null } = {}
) {
	const store = { projects };
	const requests = [];
	const find = (id) => store.projects.find((p) => p.id === id);
	const findLine = (id) => {
		for (const p of store.projects) {
			const l = p.lines.find((x) => x.id === id);
			if (l) return { p, l };
		}
		return null;
	};

	await page.route(/\/(api|analyze|say|notify)\b/, async (route) => {
		const req = route.request();
		const method = req.method();
		const path = new URL(req.url()).pathname;
		const text = req.postData() ?? null;
		let json = null;
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			json = null; // /analyze sends raw text, not JSON
		}
		requests.push({ method, path, json, text });

		// --- /notify/stream: open an SSE stream that never emits, to avoid a hang. ---
		if (path.startsWith('/notify/stream')) {
			return route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: ':\n\n'
			});
		}

		// --- /say: any 200 with a dummy audio blob (playback is out of scope). ---
		if (path.startsWith('/say')) {
			if (sayAudio)
				return route.fulfill({ status: 200, contentType: 'audio/wav', body: sayAudio });
			return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' });
		}

		// --- /analyze: return the fixed script array. ---
		if (path === '/analyze') {
			return route.fulfill(jsonBody(analyzeResult));
		}

		// --- Projects list ---
		if (path === '/api/projects' && method === 'GET') {
			return route.fulfill(jsonBody(serializeList(store)));
		}
		if (path === '/api/projects' && method === 'POST') {
			const p = project(json?.name ?? '', []);
			store.projects.push(p);
			return route.fulfill(jsonBody(serializeDetail(p)));
		}

		// --- Reorder: PUT /api/projects/:id/lines/order  { order: [...] } ---
		let m = path.match(/^\/api\/projects\/([^/]+)\/lines\/order$/);
		if (m && method === 'PUT') {
			const p = find(m[1]);
			if (p) {
				const order = json?.order ?? [];
				p.lines.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
			}
			return route.fulfill(jsonBody({ ok: true }));
		}

		// --- Add line: POST /api/projects/:id/lines -> single line (appended) ---
		m = path.match(/^\/api\/projects\/([^/]+)\/lines$/);
		if (m && method === 'POST') {
			const p = find(m[1]);
			const l = line(json.mode, json.text, { script: json.script ?? null });
			p.lines.push(l);
			return route.fulfill(jsonBody({ ...l, project_id: p.id, position: p.lines.length - 1 }));
		}

		// --- Project detail / rename / delete: /api/projects/:id ---
		m = path.match(/^\/api\/projects\/([^/]+)$/);
		if (m) {
			const p = find(m[1]);
			if (method === 'GET') return route.fulfill(jsonBody(serializeDetail(p)));
			if (method === 'PATCH') {
				if (p && json?.name != null) p.name = json.name;
				return route.fulfill(jsonBody(serializeDetail(p)));
			}
			if (method === 'DELETE') {
				store.projects = store.projects.filter((x) => x.id !== m[1]);
				return route.fulfill(jsonBody({ ok: true }));
			}
		}

		// --- Duplicate: POST /api/lines/:id/duplicate -> copy inserted below ---
		m = path.match(/^\/api\/lines\/([^/]+)\/duplicate$/);
		if (m && method === 'POST') {
			const hit = findLine(m[1]);
			const copy = line(hit.l.mode, hit.l.text, { script: hit.l.script });
			const idx = hit.p.lines.indexOf(hit.l);
			hit.p.lines.splice(idx + 1, 0, copy);
			return route.fulfill(jsonBody({ ...copy, project_id: hit.p.id, position: idx + 1 }));
		}

		// --- Line update / delete: /api/lines/:id ---
		m = path.match(/^\/api\/lines\/([^/]+)$/);
		if (m) {
			const hit = findLine(m[1]);
			if (method === 'PATCH') {
				if (hit) Object.assign(hit.l, json);
				return route.fulfill(jsonBody({ ...hit.l, project_id: hit.p.id }));
			}
			if (method === 'DELETE') {
				if (hit) hit.p.lines = hit.p.lines.filter((x) => x.id !== m[1]);
				return route.fulfill(jsonBody({ ok: true }));
			}
		}

		// Anything unhandled (e.g. dictionary) returns an empty list so the app boots.
		return route.fulfill(jsonBody([]));
	});

	return { store, requests };
}

// --- Navigation helpers (keyboard-driven, matching how a user reaches state) ---

// Open the first (cursor) project via Enter, then move focus into the 台本 column
// with `l`. Waits on the design's focus-ring selectors, never on fixed sleeps.
export async function openFirstProjectLines(page) {
	await page.locator('.list-pane .card.focused').first().waitFor();
	await page.keyboard.press('Enter'); // select the cursor project
	await page.locator('.detail-pane .row').first().waitFor();
	await page.keyboard.press('l'); // move the vim cursor into the 台本 column
	await page.locator('.detail-pane .row.focused').first().waitFor();
}

// Install the mock (see installApi options), load the app, and park the vim cursor
// on the first 台本 row — the starting point most shortcut tests need. Returns
// installApi's { store, requests } so callers can still inspect backend traffic.
export async function bootLines(page, opts) {
	const api = await installApi(page, opts);
	await page.goto('/');
	await openFirstProjectLines(page);
	return api;
}
