import { test, expect } from '@playwright/test';
import { installApi, project, line } from './helpers.js';

// Coverage item 9: n toggles the header notify megaphone (ON = class `on` +
// aria-pressed). App.svelte case 'n' 470-475, NotifySubscribe toggle 66-70.

test('n turns the megaphone ON, then OFF again', async ({ page }) => {
	await installApi(page, { projects: [project('企画A', [line('announcer', '行', { id: 'a1' })])] });
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toBeVisible();

	const megaphone = page.locator('.megaphone');
	await expect(megaphone).toHaveAttribute('aria-pressed', 'false');

	await page.keyboard.press('n');
	await expect(megaphone).toHaveAttribute('aria-pressed', 'true');
	await expect(megaphone).toHaveClass(/\bon\b/);

	await page.keyboard.press('n');
	await expect(megaphone).toHaveAttribute('aria-pressed', 'false');
	await expect(megaphone).not.toHaveClass(/\bon\b/);
});
