// タブ = ルートの最小ルータ (novel-server の lib/router.svelte.js のパターンを踏襲)。
// History API + popstate で、リロードやブラウザバックでも開いていたタブが保たれる。
// サーバ側は非 API GET を SPA フォールバックで index.html に落とすので (src/spa.rs)、
// /dict や /work への直リンクもそのまま開ける。

const PATH_BY_TAB = { script: '/', dict: '/dict', work: '/work' };
const TAB_BY_PATH = { '/': 'script', '/dict': 'dict', '/work': 'work' };

function tabFromURL() {
	return TAB_BY_PATH[window.location.pathname] ?? 'script';
}

let _tab = $state(tabFromURL());

// 未知パス (SPA フォールバックで index.html が返るため到達しうる) は台本タブとして
// 表示しつつ、URL 自体も / へ正規化しておく — でないと台本タブへ「戻す」手段がなくなる。
if (!(window.location.pathname in TAB_BY_PATH)) {
	history.replaceState({}, '', PATH_BY_TAB[_tab]);
}

export function navigate(tab) {
	const path = PATH_BY_TAB[tab] ?? '/';
	if (window.location.pathname === path) {
		_tab = tab;
		return;
	}
	history.pushState({}, '', path);
	_tab = tab;
}

window.addEventListener('popstate', () => {
	_tab = tabFromURL();
});

export const router = {
	get tab() {
		return _tab;
	}
};
