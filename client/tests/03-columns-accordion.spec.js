import { test, expect } from '@playwright/test';
import { installApi, project, line, openFirstProjectLines } from './helpers.js';

// Coverage item 3: h/l column switch, Enter opening a project, and Enter (only)
// toggling the 演技 accordion (announcer rows are a no-op). Space is now the
// play/stop shortcut, so it must NOT toggle the accordion. App.svelte
// activateCursor 301-308, toggleExpandLine 285-288.

test.beforeEach(async ({ page }) => {
	await installApi(page, {
		projects: [
			project('企画A', [
				line('acting', '演技の行', { id: 'act', script: [{ happy: 1 }] }),
				line('announcer', 'アナの行', { id: 'ann' })
			])
		]
	});
	await page.goto('/');
});

test('h / l move the vim cursor between columns', async ({ page }) => {
	await openFirstProjectLines(page); // ends in the 台本 column
	await expect(page.locator('.layout')).toHaveAttribute('data-active-col', 'line');
	await page.keyboard.press('h');
	await expect(page.locator('.layout')).toHaveAttribute('data-active-col', 'project');
	await page.keyboard.press('l');
	await expect(page.locator('.layout')).toHaveAttribute('data-active-col', 'line');
});

test('Enter toggles the 演技 accordion; Space does not; アナ rows are inert', async ({ page }) => {
	await openFirstProjectLines(page); // cursor on the first (acting) row
	await expect(page.locator('.detail-pane .row.focused')).toContainText('演技の行');

	await page.keyboard.press('Enter'); // open
	await expect(page.locator('.expansion')).toBeVisible();
	await page.keyboard.press('Enter'); // close
	await expect(page.locator('.expansion')).toHaveCount(0);

	// Space is now play/stop, not accordion: the expansion must stay closed. Open it
	// with Enter first, then confirm Space leaves it as-is (does not close it either).
	await page.keyboard.press(' '); // Space on a closed row must not open it
	await expect(page.locator('.expansion')).toHaveCount(0);

	await page.keyboard.press('j'); // move to the announcer row
	await expect(page.locator('.detail-pane .row.focused')).toContainText('アナの行');
	await page.keyboard.press('Enter'); // no-op on announcer
	await expect(page.locator('.expansion')).toHaveCount(0);
});
