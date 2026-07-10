import { test, expect } from '@playwright/test';
import { bootLines, project, line } from './helpers.js';

// Coverage item 6: o / O open NewLineModal and insert at the right slot.
// App.svelte openNewLine 377-379, commitNewLine 381-384.

const fixture = () => ({
	projects: [
		project('企画A', [
			line('announcer', 'A行', { id: 'A' }),
			line('announcer', 'B行', { id: 'B' })
		])
	]
});

const texts = (page) => page.locator('.detail-pane .row .text');

test('o inserts a new line below the cursor', async ({ page }) => {
	await bootLines(page, fixture()); // cursor on A

	await page.keyboard.press('o');
	const input = page.getByLabel('行テキスト');
	await expect(input).toBeVisible();
	await input.fill('C行');
	await input.press('Enter');

	await expect(texts(page)).toHaveText(['A行', 'C行', 'B行']);
});

test('O inserts a new line above the cursor', async ({ page }) => {
	await bootLines(page, fixture()); // cursor on A

	await page.keyboard.press('O');
	const input = page.getByLabel('行テキスト');
	await expect(input).toBeVisible();
	await input.fill('C行');
	await input.press('Enter');

	await expect(texts(page)).toHaveText(['C行', 'A行', 'B行']);
});
