// The fixed five emotion axes (docs/DESIGN.md). Order is canonical and used
// everywhere chips and sliders render. Each axis owns one data color, exposed
// as a CSS custom property in global.sass.
export const EMOTIONS = [
	{ key: 'bosoboso', label: 'ぼそぼそ', color: 'var(--emo-bosoboso)' },
	{ key: 'doyaru', label: 'ドヤ', color: 'var(--emo-doyaru)' },
	{ key: 'honwaka', label: 'ほんわか', color: 'var(--emo-honwaka)' },
	{ key: 'angry', label: '怒り', color: 'var(--emo-angry)' },
	{ key: 'teary', label: '涙声', color: 'var(--emo-teary)' }
];

// Summarize a script (segment array) into { axis: maxValue } across segments,
// keeping only axes actually present. Chips on a row use this.
export function summarizeEmotion(script) {
	const out = {};
	if (!Array.isArray(script)) return out;
	for (const seg of script) {
		const e = seg?.emotion;
		if (!e) continue;
		for (const { key } of EMOTIONS) {
			if (typeof e[key] === 'number') {
				out[key] = Math.max(out[key] ?? 0, e[key]);
			}
		}
	}
	return out;
}
