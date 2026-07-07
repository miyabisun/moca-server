// JSON fetch wrapper: throws on non-2xx, returns parsed body.
export default async function fetcher(url, options) {
	const r = await fetch(url, options);
	if (!r.ok) {
		const msg = await r.text().catch(() => '');
		throw new Error(msg || `${r.status} ${r.statusText}`);
	}
	return r.json();
}
