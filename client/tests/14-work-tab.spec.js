import { test, expect } from '@playwright/test';
import { installApi, project, line } from './helpers.js';
import { workLines } from '../src/lib/work/lines.js';

// 問いかけプールの本文一覧 (発話内容の検証用)。
const poolTexts = (category) => workLines[category].map((s) => s[0].text);

// Coverage item 14: the 作業 tab. The pomodoro state machine keeps its deadline
// as Date.now()+ms (timer.svelte.js), so page.clock can drive whole phases. The
// milestone voice speaks by POSTing a script JSON to /say via its own private
// audio path (voice.svelte.js) — observable in the requests log without sound.
// There is no set count: work → break → 「どうする?」(askNext) and the timer
// waits for the user to start another set or end the session.

const said = (requests) =>
	requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).length;

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

test('作業→休憩→「どうする?」で止まり、もう1セットはユーザーが決める', async ({ page }) => {
	// 14:30 開始 -> 問いかけは 15:00 ごろ = 汎用プールの時間帯 (昼/夕/夜のどれでもない)。
	await page.clock.install({ time: new Date('2026-01-01T14:30:00') });
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await page.getByRole('button', { name: /声かけ/ }).click(); // OFF -> ON (gesture unlock)
	await page.getByRole('button', { name: '開始' }).click();

	const panel = page.locator('.panel[data-phase]');
	await expect(panel).toHaveAttribute('data-phase', 'work');
	await expect.poll(() => said(requests)).toBe(1); // start の節目

	await page.clock.fastForward(25 * 60_000 + 1_500); // 作業フェーズ満了
	await expect(panel).toHaveAttribute('data-phase', 'break');
	await expect.poll(() => said(requests)).toBe(2); // breakStart

	await page.clock.fastForward(5 * 60_000 + 1_500); // 休憩満了 -> 問いかけて待つ
	await expect(panel).toHaveAttribute('data-phase', 'idle');
	await expect(page.locator('.phase-label')).toHaveText('どうする?');
	await expect.poll(() => said(requests)).toBe(3); // askNext の問いかけ
	const ask = requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).at(-1);
	expect(poolTexts('askGeneric')).toContain(ask.json[0].text);

	await page.getByRole('button', { name: 'もう1セット' }).click(); // 続きはユーザーの意思
	await expect(panel).toHaveAttribute('data-phase', 'work');
	await expect.poll(() => said(requests)).toBe(4); // start
});

// 問いかけの時間帯分岐: お昼前 (11時台) / お昼過ぎ (12時台) / 夜 (21-4)。
// 判定は開始 30 分後 (休憩明け) の時刻。
for (const [timeStr, pool] of [
	['2026-01-01T11:10:00', 'askLunch'],
	['2026-01-01T11:40:00', 'askLunchLate'],
	['2026-01-01T21:30:00', 'askNight']
]) {
	test(`休憩明けの問いかけは時間帯で変わる (${pool})`, async ({ page }) => {
		await page.clock.install({ time: new Date(timeStr) });
		const { requests } = await installApi(page, { projects: [] });
		await page.goto('/');

		await page.getByRole('button', { name: '作業' }).click();
		await page.getByRole('button', { name: /声かけ/ }).click();
		await page.getByRole('button', { name: '開始' }).click();
		await expect.poll(() => said(requests)).toBe(1);

		await page.clock.fastForward(25 * 60_000 + 1_500);
		await page.clock.fastForward(5 * 60_000 + 1_500);
		await expect.poll(() => said(requests)).toBe(3);
		const ask = requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).at(-1);
		expect(poolTexts(pool)).toContain(ask.json[0].text);
	});
}

test('セッション中に終了を押すとおつかれさまを言って待機に戻る', async ({ page }) => {
	await page.clock.install();
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();
	await expect.poll(() => said(requests)).toBe(1);

	await page.getByRole('button', { name: '終了' }).click();
	await expect(page.locator('.panel[data-phase]')).toHaveAttribute('data-phase', 'idle');
	await expect.poll(() => said(requests)).toBe(2); // end のおつかれさま
});

test('一時停止で残り時間が保持され、再開後に期限が引き直される', async ({ page }) => {
	await page.clock.install();
	await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
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
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();
	await expect.poll(() => said(requests)).toBe(1); // start の 1 回

	// 作業25分+休憩5分を一気に跳び越す (breakStart と askNext の 2 遷移分)。
	// fastForward は各タイマーを高々 1 回しか発火させないので、tick は経過後に
	// 1 度だけ走り、catch-up ループが 2 遷移をまとめて消化する = スリープ相当。
	// 最終状態が「どうする?」なので、溜まった遷移は resync ではなく askNext に
	// 潰れ、UI と音声が一致する (問いかけがおかえり+意思確認を兼ねる)。
	await page.clock.fastForward(31 * 60_000);
	await expect(page.locator('.panel[data-phase]')).toHaveAttribute('data-phase', 'idle');
	await expect(page.locator('.phase-label')).toHaveText('どうする?');
	await expect.poll(() => said(requests)).toBe(2);
	const last = requests.filter((r) => r.path === '/say' && Array.isArray(r.json)).at(-1);
	const askAll = ['askGeneric', 'askLunch', 'askDinner', 'askNight'].flatMap(poolTexts);
	expect(askAll).toContain(last.json[0].text); // resume ではなく問いかけ
});

test('作業中チャッター: 1〜1.5分のどこかで独り言が小声(音量0.45)で入る', async ({ page }) => {
	await page.clock.install();
	// Audio.play 時の volume を記録して、独り言だけ音量が絞られることを観測する。
	await page.addInitScript(() => {
		const OrigAudio = window.Audio;
		window.__volumes = [];
		window.Audio = class extends OrigAudio {
			play() {
				window.__volumes.push(this.volume);
				return super.play();
			}
		};
	});
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();
	await expect.poll(() => said(requests)).toBe(1); // start の節目

	// チャッターの予約は最長 1.5 分。2 分ならフェーズ境界 (25 分) を跨がずに
	// 少なくとも 1 回は発火している (再予約分が窓内に入ればそれ以上も可)。
	await page.clock.fastForward(2 * 60_000);
	await expect.poll(() => said(requests)).toBeGreaterThanOrEqual(2);
	// 節目 (start) は等倍、チャッターは 0.45 で再生される。
	await expect
		.poll(() => page.evaluate(() => window.__volumes))
		.toEqual(expect.arrayContaining([1, 0.45]));
});

test('おしゃべり「なし」なら作業中に独り言は入らない', async ({ page }) => {
	await page.clock.install();
	const { requests } = await installApi(page, { projects: [] });
	await page.goto('/');

	await page.getByRole('button', { name: '作業' }).click();
	await page.locator('.settings select').selectOption('off');
	await page.getByRole('button', { name: /声かけ/ }).click();
	await page.getByRole('button', { name: '開始' }).click();
	await expect.poll(() => said(requests)).toBe(1); // start の節目

	await page.clock.fastForward(5 * 60_000);
	expect(said(requests)).toBe(1); // チャッターは増えない
});

test('LLM 声かけ: 生成された script がそのまま /say に流れる', async ({ page }) => {
	// Math.random を 0 に固定して LLM 経路 (確率 25%) を強制する。
	await page.addInitScript(() => {
		Math.random = () => 0;
	});
	const generated = [{ text: '生成セリフです', emotion: { honwaka: 15 } }];
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
	await page.getByRole('button', { name: '開始' }).click();

	const panel = page.locator('.panel[data-phase]');
	await expect(panel).toHaveAttribute('data-phase', 'work');
	await page.clock.fastForward(25 * 60_000 + 1_500);
	await expect(panel).toHaveAttribute('data-phase', 'break');

	expect(requests.some((r) => r.path.startsWith('/say'))).toBe(false);
});
