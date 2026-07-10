import { test, expect } from '@playwright/test';
import { bootLines, project, line } from './helpers.js';

// Coverage item 5: dd. Deletes with NO ConfirmModal, moves the cursor to the next
// row (or previous if last), yanks the deleted line so p restores it. App.svelte
// deleteFocusedLine 335-350.

const fixture = () => ({
	projects: [
		project('企画A', [
			line('announcer', 'A行', { id: 'A' }),
			line('announcer', 'B行', { id: 'B' }),
			line('announcer', 'C行', { id: 'C' })
		])
	]
});

const deletes = (requests) => requests.filter((r) => r.method === 'DELETE' && /\/lines\//.test(r.path));

test('dd deletes without confirm and moves the cursor to the next row', async ({ page }) => {
	const { requests } = await bootLines(page, fixture()); // cursor on A

	await page.keyboard.press('d');
	await page.keyboard.press('d');

	await expect(page.locator('.detail-pane .row')).toHaveCount(2);
	// No ConfirmModal appeared.
	await expect(page.locator('[role="dialog"]')).toHaveCount(0);
	expect(deletes(requests).pop().path).toContain('/api/lines/A');
	// Cursor followed to the next row (B).
	await expect(page.locator('.detail-pane .row.focused')).toContainText('B行');
});

test('dd on the last row moves the cursor to the previous row', async ({ page }) => {
	await bootLines(page, fixture());
	await page.keyboard.press('j');
	await page.keyboard.press('j'); // cursor on C (last)
	await expect(page.locator('.detail-pane .row.focused')).toContainText('C行');

	await page.keyboard.press('d');
	await page.keyboard.press('d');

	await expect(page.locator('.detail-pane .row')).toHaveCount(2);
	await expect(page.locator('.detail-pane .row.focused')).toContainText('B行');
});

test('the deleted line lands in the yank register and p restores it', async ({ page }) => {
	await bootLines(page, fixture()); // cursor on A

	await page.keyboard.press('d');
	await page.keyboard.press('d'); // delete A, cursor -> B
	await expect(page.locator('.detail-pane .row')).toHaveCount(2);

	await page.keyboard.press('p'); // paste A below B
	await expect(page.locator('.detail-pane .row')).toHaveCount(3);
	await expect(page.locator('.detail-pane .row .text').nth(1)).toHaveText('A行');
});
