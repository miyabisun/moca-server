import { test, expect } from '@playwright/test';
import { installApi, project, line } from './helpers.js';

// Coverage item 14: the 作業 tab. The pomodoro state machine keeps its deadline
// as Date.now()+ms (timer.svelte.js), so page.clock can drive whole phases. The
// milestone voice speaks by POSTing a script JSON to /say via its own private
// audio path (voice.svelte.js) — observable in the requests log without sound.

// 既定セット数は 1。休憩フェーズを踏むテストはここでセット数を増やしてから始める。
async function setSets(page, n) {
	const input = page.locator('.settings input').nth(2);
	await input.fill(String(n));
	await input.blur();
}

test('作業タブに切り替わりタイマー盤が出る。vimショートカットは無反応', async ({ page }) => {
	await installApi(page, {
		projects: [project('企画A', [line('announcer', 'A行', { id: 'A' })])]
	});
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toBeVisible();

	await page.getByRole('button', { name: '作業' }).click();
	const panel = page.locator('.panel[data-phase]');
	await expect(panel).toHaveAttribute('data-phase', 'idle');
	await expect(page.locator('.time')).toHaveText('25:00'); // 既定の作業 25 分

	await page.keyboard.press('n'); // activeTab !== 'script' -> ignored
	await expect(page.locator('.megaphone')).toHaveAttribute('aria-pressed', 'false');
});

test('クロックを進めると 作業→休憩→作業 と遷移し、節目ごとに声かけの /say が飛ぶ', async ({
	page
}) => {
	await page.clock.install();
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await setSets(page, 2);
	await page.getByRole('button', { name: /声かけ/ }).click(); // OFF -> ON (gesture unlock)
	await page.getByRole('button', { name: '開始' }).click();

	const panel = page.locator('.panel[data-phase]');
	await expect(panel).toHaveAttribute('data-phase', 'work');
	// 開始の節目: script JSON (配列) が POST される。
	await expect
		.poll(() => requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).length)
		.toBe(1);

	await page.clock.fastForward(25 * 60_000 + 1_500); // 作業フェーズ満了
	await expect(panel).toHaveAttribute('data-phase', 'break');
	await expect
		.poll(() => requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).length)
		.toBe(2);

	await page.clock.fastForward(5 * 60_000 + 1_500); // 休憩満了 -> 2 セット目
	await expect(panel).toHaveAttribute('data-phase', 'work');
	await expect
		.poll(() => requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).length)
		.toBe(3);
});

test('既定は 1 セット: 作業満了で休憩を挟まず完了して待機に戻る', async ({ page }) => {
	await page.clock.install();
	await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await page.getByRole('button', { name: '開始' }).click(); // セット数は既定のまま

	const panel = page.locator('.panel[data-phase]');
	await expect(panel).toHaveAttribute('data-phase', 'work');
	await page.clock.fastForward(25 * 60_000 + 1_500); // 1 セット満了
	await expect(panel).toHaveAttribute('data-phase', 'idle'); // break を経ない
});

test('一時停止で残り時間が保持され、再開後に期限が引き直される', async ({ page }) => {
	await page.clock.install();
	await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await setSets(page, 2);
	await page.getByRole('button', { name: '開始' }).click();
	await page.clock.fastForward(5 * 60_000); // 5 分経過 -> 残り 20:00

	await page.getByRole('button', { name: '一時停止' }).click();
	await page.clock.fastForward(60 * 60_000); // 停止中に 1 時間進めても
	await expect(page.locator('.time')).toHaveText('20:00'); // 残りは減らない

	await page.getByRole('button', { name: '再開' }).click();
	await page.clock.fastForward(20 * 60_000 + 1_500); // 残りを使い切ると遷移する
	await expect(page.locator('.panel[data-phase]')).toHaveAttribute('data-phase', 'break');
});

test('複数フェーズをまたぐ長いスリープでは節目を溜め撃ちせず resync 1 回に潰す', async ({
	page
}) => {
	await page.clock.install();
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await setSets(page, 2);
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();
	await expect
		.poll(() => requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).length)
		.toBe(1); // start の 1 回

	// 作業25分+休憩5分を一気に跳び越す (breakStart と breakEnd の 2 遷移分)。
	// fastForward は各タイマーを高々 1 回しか発火させないので、tick は経過後に
	// 1 度だけ走り、catch-up ループが 2 遷移をまとめて消化する = スリープ相当。
	await page.clock.fastForward(31 * 60_000);
	await expect(page.locator('.panel[data-phase]')).toHaveAttribute('data-phase', 'work');
	// 溜まった 2 遷移が resync 1 回 (resume セリフ) に潰れ、合計 2 回のまま。
	await expect
		.poll(() => requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).length)
		.toBe(2);
});

test('休憩中にセット数を減らすと余分な作業セットへ進まず完了する', async ({ page }) => {
	await page.clock.install();
	await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await setSets(page, 2);
	await page.getByRole('button', { name: '開始' }).click();
	await page.clock.fastForward(25 * 60_000 + 1_500); // 1 セット目終了 -> 休憩
	const panel = page.locator('.panel[data-phase]');
	await expect(panel).toHaveAttribute('data-phase', 'break');

	await setSets(page, 1); // 休憩中にセット数 2 -> 1
	await page.clock.fastForward(5 * 60_000 + 1_500); // 休憩明け
	await expect(panel).toHaveAttribute('data-phase', 'idle'); // 2 セット目へは進まない
});

test('作業中チャッター: 5〜15分のどこかで一言入り、「なし」なら入らない', async ({ page }) => {
	await page.clock.install();
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');
	const said = () => requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).length;

	await page.getByRole('button', { name: '作業' }).click();
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();
	await expect.poll(said).toBe(1); // start の節目

	// チャッターの予約は最長 15 分。16 分ならフェーズ境界 (25 分) を跨がずに
	// 必ず 1 回発火している。
	await page.clock.fastForward(16 * 60_000);
	await expect.poll(said).toBe(2);

	// 「なし」に切り替えると次の作業フェーズでは予約されない。
	await page.locator('.settings select').selectOption('off');
	await page.getByRole('button', { name: 'リセット' }).click();
	await page.getByRole('button', { name: '開始' }).click();
	await expect.poll(said).toBe(3); // start の節目だけ
	await page.clock.fastForward(16 * 60_000);
	expect(said()).toBe(3); // チャッターは増えない
});

test('LLM 声かけ: 生成された script がそのまま /say に流れる', async ({ page }) => {
	// Math.random を 0 に固定して LLM 経路 (確率 25%) を強制する。
	await page.addInitScript(() => {
		Math.random = () => 0;
	});
	const generated = [{ text: '生成セリフです', emotion: { honwaka: 30 } }];
	const { requests } = await installApi(page, {
		projects: [],
		workTalkResult: generated
	});
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();

	await expect.poll(() => requests.filter((r) => r.path === '/work/talk').length).toBe(1);
	expect(requests.find((r) => r.path === '/work/talk').json.kind).toBe('milestone');
	await expect
		.poll(() => requests.find((r) => r.path === '/say' && Array.isArray(r.json))?.json)
		.toEqual(generated);
});

test('LLM 声かけ: /work/talk が 502 なら固定セリフにフォールバックする', async ({ page }) => {
	await page.addInitScript(() => {
		Math.random = () => 0; // LLM 経路を強制 (モックの既定応答は 502)
	});
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();

	await expect.poll(() => requests.filter((r) => r.path === '/work/talk').length).toBe(1);
	// フォールバック: lines.js の start カテゴリ先頭 (random=0) が /say に流れる。
	await expect
		.poll(() => requests.find((r) => r.path === '/say' && Array.isArray(r.json))?.json?.[0]?.text)
		.toBe('んじゃ、始めよっか。');
});

test('声かけ OFF のままなら節目でも /say は飛ばない', async ({ page }) => {
	await page.clock.install();
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await setSets(page, 2);
	await page.getByRole('button', { name: '開始' }).click();

	const panel = page.locator('.panel[data-phase]');
	await expect(panel).toHaveAttribute('data-phase', 'work');
	await page.clock.fastForward(25 * 60_000 + 1_500);
	await expect(panel).toHaveAttribute('data-phase', 'break');

	expect(requests.some((r) => r.path.startsWith('/say'))).toBe(false);
});
