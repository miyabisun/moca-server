import { test, expect } from '@playwright/test';
import { installApi, bootLines, project, line, silentWav } from './helpers.js';

// Coverage item 11: Space plays/stops the focused target via the same functions
// the buttons call. プロジェクト列 = whole-project radio (.play-all active), 台本列
// = single line (.row.playing). A real audio clip (silentWav) keeps the indicator
// visible; the second Space stops it synchronously. App.svelte onWindowKeydown
// Space branch, onPlayAll 96-110, onplay 91-93.

test('Space starts and stops whole-project radio from the プロジェクト column', async ({ page }) => {
	const { requests } = await installApi(page, {
		projects: [project('企画A', [line('announcer', '一行目', { id: 'a1' })])],
		sayAudio: silentWav()
	});
	await page.goto('/');

	const card = page.locator('.list-pane .card.focused');
	await expect(card).toContainText('企画A'); // focus starts in the プロジェクト column
	expect(requests.some((r) => r.path === '/say')).toBe(false);

	await page.keyboard.press(' '); // start radio
	await expect(card.locator('.play-all.active')).toBeVisible();
	await expect.poll(() => requests.some((r) => r.path === '/say')).toBe(true);

	await page.keyboard.press(' '); // stop radio (radioProjectId match -> stop)
	await expect(card.locator('.play-all.active')).toHaveCount(0);
});

test('Space plays and stops the focused row in the 台本 column', async ({ page }) => {
	const { requests } = await bootLines(page, {
		projects: [project('企画A', [line('announcer', '一行目', { id: 'a1' })])],
		sayAudio: silentWav()
	});

	const row = page.locator('.detail-pane .row.focused');
	await expect(row).toContainText('一行目');
	expect(requests.some((r) => r.path === '/say')).toBe(false);

	await page.keyboard.press(' '); // single play
	await expect(row).toHaveClass(/playing/);
	await expect.poll(() => requests.some((r) => r.path === '/say')).toBe(true);

	await page.keyboard.press(' '); // same line active -> stop
	await expect(row).not.toHaveClass(/playing/);
});
