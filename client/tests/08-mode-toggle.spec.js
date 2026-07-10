import { test, expect } from '@playwright/test';
import { bootLines, project, line } from './helpers.js';

// Coverage item 8: m. アナ→演技 runs /analyze inline; 演技→アナ is destructive and
// routes through a ConfirmModal. App.svelte toggleMode 150-156.

test('m on an アナ line runs /analyze and flips the badge to 演技', async ({ page }) => {
	const { requests } = await bootLines(page, {
		projects: [project('企画A', [line('announcer', 'アナ行', { id: 'a1' })])]
	});

	await page.keyboard.press('m');

	await expect(page.locator('.detail-pane .row .badge')).toHaveText('演技');
	expect(requests.some((r) => r.path === '/analyze')).toBe(true);
});

test('m on a 演技 line opens the ConfirmModal and does not analyze', async ({ page }) => {
	const { requests } = await bootLines(page, {
		projects: [project('企画A', [line('acting', '演技行', { id: 'x', script: [{ happy: 1 }] })])]
	});

	await page.keyboard.press('m');

	await expect(page.locator('[role="dialog"]')).toContainText('演技を解除');
	expect(requests.some((r) => r.path === '/analyze')).toBe(false);
});
