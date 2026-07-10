import { test, expect } from '@playwright/test';
import { installApi, project, line, openFirstProjectLines } from './helpers.js';

// Coverage item 10: shortcut guards. No global shortcut fires while typing in an
// input, while a modal is open, or on the 辞書 tab. App.svelte onWindowKeydown
// early returns 417-421 (editableFocused / anyModalOpen), 417 (activeTab).

test('shortcuts do not fire while an input is focused', async ({ page }) => {
	await installApi(page, {
		projects: [
			project('企画A', [line('announcer', 'A行', { id: 'A' })]),
			project('企画B', [line('announcer', 'B行', { id: 'B' })])
		]
	});
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toContainText('企画A');

	// Open the create form and focus its input -> editableFocused() is true.
	await page.getByRole('button', { name: '新規' }).click();
	const nameInput = page.locator('.new-form input');
	await nameInput.focus();
	await expect(nameInput).toBeFocused();

	await page.keyboard.press('j'); // would move the project cursor if it fired
	await expect(page.locator('.list-pane .card.focused')).toContainText('企画A');
});

test('shortcuts do not fire while a modal is open', async ({ page }) => {
	await installApi(page, { projects: [project('企画A', [line('announcer', 'A行', { id: 'A' })])] });
	await page.goto('/');
	await openFirstProjectLines(page);

	await page.keyboard.press('o'); // open NewLineModal
	await expect(page.getByLabel('行テキスト')).toBeVisible();

	await page.keyboard.press('n'); // must be swallowed by the modal guard
	await expect(page.locator('.megaphone')).toHaveAttribute('aria-pressed', 'false');
});

test('shortcuts do not fire on the 辞書 tab', async ({ page }) => {
	await installApi(page, { projects: [project('企画A', [line('announcer', 'A行', { id: 'A' })])] });
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toBeVisible();

	await page.getByRole('button', { name: '辞書' }).click();
	await page.keyboard.press('n'); // activeTab !== 'script' -> ignored
	await expect(page.locator('.megaphone')).toHaveAttribute('aria-pressed', 'false');
});
