import { test, expect } from '@playwright/test';
import { installApi, project, line } from './helpers.js';

// Coverage item 2: the `l` boundary guard. With no project open, or a project with
// zero lines, pressing `l` must NOT move focus into an empty 台本 column — the ring
// would land on nothing (App.svelte onWindowKeydown case 'l' 448-456).

test('l is a no-op while no project is open', async ({ page }) => {
	await installApi(page, { projects: [project('企画A', [line('announcer', '行', { id: 'a1' })])] });
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toContainText('企画A');
	await page.keyboard.press('l');
	await expect(page.locator('.layout')).toHaveAttribute('data-active-col', 'project');
	await expect(page.locator('.list-pane .card.focused')).toHaveCount(1);
});

test('l is a no-op for a project with zero lines', async ({ page }) => {
	await installApi(page, { projects: [project('空企画', [])] });
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toContainText('空企画');
	await page.keyboard.press('Enter'); // open the empty project
	await expect(page.locator('.detail-pane .empty')).toBeVisible();
	await page.keyboard.press('l');
	await expect(page.locator('.layout')).toHaveAttribute('data-active-col', 'project');
	await expect(page.locator('.list-pane .card.focused')).toHaveCount(1);
});
