import { test, expect } from '@playwright/test';
import { bootLines, project, line } from './helpers.js';

// Coverage item 12: the ? shortcut cheat-sheet. Opens from the ? key and the
// footer button, closes with Esc, and (like any modal) swallows other shortcuts
// while open. App.svelte helpOpen / anyModalOpen, HelpModal.svelte.

const fixture = () => ({ projects: [project('企画A', [line('announcer', '一行目', { id: 'a1' })])] });

test('the ? key opens the cheat-sheet and Esc closes it', async ({ page }) => {
	await bootLines(page, fixture());

	const dialog = page.getByRole('dialog');
	await expect(dialog).toHaveCount(0);

	await page.keyboard.press('?');
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('ショートカット');

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
});

test('the footer button opens the same cheat-sheet', async ({ page }) => {
	await bootLines(page, fixture());

	await page.getByRole('button', { name: 'ショートカット一覧' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	// The latest keymap is listed: keys added/changed this cycle must appear.
	for (const key of ['Space', 'Enter', 'n', '?', 'a / i']) {
		await expect(dialog.locator('kbd', { hasText: new RegExp(`^${key.replace('?', '\\?')}$`) })).toHaveCount(1);
	}

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
});

test('other shortcuts do not fire while the cheat-sheet is open', async ({ page }) => {
	await bootLines(page, fixture());

	await page.keyboard.press('?');
	await expect(page.getByRole('dialog')).toBeVisible();

	await page.keyboard.press('n'); // must be swallowed by the modal guard
	await expect(page.locator('.megaphone')).toHaveAttribute('aria-pressed', 'false');
});
