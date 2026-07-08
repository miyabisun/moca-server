import fetcher from '$lib/fetcher.js';

const json = (method, body) => ({
	method,
	headers: { 'Content-Type': 'application/json' },
	body: body === undefined ? undefined : JSON.stringify(body)
});

// --- Projects ---
export const listProjects = () => fetcher('/api/projects');
export const getProject = (id) => fetcher(`/api/projects/${id}`);
export const createProject = (name) => fetcher('/api/projects', json('POST', { name }));
export const renameProject = (id, name) => fetcher(`/api/projects/${id}`, json('PATCH', { name }));
export const deleteProject = (id) => fetcher(`/api/projects/${id}`, json('DELETE'));

// --- Lines ---
export const addLine = (projectId, line) =>
	fetcher(`/api/projects/${projectId}/lines`, json('POST', line));
export const updateLine = (id, patch) => fetcher(`/api/lines/${id}`, json('PATCH', patch));
export const deleteLine = (id) => fetcher(`/api/lines/${id}`, json('DELETE'));
// Duplicate a line (mode + script included), inserting the copy directly below.
export const duplicateLine = (id) => fetcher(`/api/lines/${id}/duplicate`, json('POST'));
export const reorderLines = (projectId, order) =>
	fetcher(`/api/projects/${projectId}/lines/order`, json('PUT', { order }));

// --- Dictionary (reading dictionary; applied at synthesis only) ---
export const listDict = () => fetcher('/api/dictionary');
export const createDict = (surface, reading) =>
	fetcher('/api/dictionary', json('POST', { surface, reading }));
export const deleteDict = (id) => fetcher(`/api/dictionary/${id}`, json('DELETE'));

// --- Import ---
// Announcer mode: fast, returns { mode, created }. `afterLineId` (optional)
// inserts the new lines directly after that line; omit it to append at the end.
export const importAnnouncer = (projectId, text, afterLineId) =>
	fetcher(
		`/api/projects/${projectId}/import`,
		json('POST', { mode: 'announcer', text, after: afterLineId })
	);

// Acting mode: streams SSE progress. `onEvent({ index, total, status, line })` is
// called per line, `onComplete({ total })` at the end. Returns a promise that
// resolves when the stream ends. Aborting the AbortSignal stops it server-side.
// `afterLineId` (optional) inserts directly after that line instead of appending.
export async function importActing(projectId, text, { onEvent, onComplete, signal, afterLineId } = {}) {
	const res = await fetch(`/api/projects/${projectId}/import`, {
		...json('POST', { mode: 'acting', text, after: afterLineId }),
		signal
	});
	if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let sep;
		while ((sep = buffer.indexOf('\n\n')) !== -1) {
			const block = buffer.slice(0, sep);
			buffer = buffer.slice(sep + 2);
			let event = null;
			let data = null;
			for (const raw of block.split('\n')) {
				if (raw.startsWith('event:')) event = raw.slice(6).trim();
				if (raw.startsWith('data:')) data = JSON.parse(raw.slice(5).trim());
			}
			if (event === 'complete') onComplete?.(data);
			else if (data) onEvent?.(data);
		}
	}
}

// --- Re-analysis: run /analyze for one line's text and return the script JSON ---
export async function analyzeLine(text) {
	const res = await fetch('/analyze', { method: 'POST', body: text });
	if (!res.ok) throw new Error(await res.text().catch(() => `${res.status}`));
	return res.json();
}

// --- Playback source URLs (audio is synthesized on demand by /say) ---
// `raw` skips the reading dictionary (used by the 辞書 preview, which speaks a
// reading string verbatim so it isn't substituted again).
export const sayTextUrl = (text, raw = false) =>
	`/say?text=${encodeURIComponent(text)}${raw ? '&raw=1' : ''}`;
export const sayScriptRequest = (script) => json('POST', script);
