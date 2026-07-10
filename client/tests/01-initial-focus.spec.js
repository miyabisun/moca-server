import { test, expect } from '@playwright/test';
import { installApi, project, line } from './helpers.js';

// Coverage item 1: initial focus. A single project must still show the vim cursor
// ring on the first project card, and j/k must stop at the boundary without the
// ring ever vanishing (App.svelte $effect 258-262, moveCursor 290-299).

test.beforeEach(async ({ page }) => {
	await installApi(page, {
		projects: [project('企画A', [line('announcer', 'こんにちは', { id: 'a1' })])]
	});
	await page.goto('/');
});

test('a lone project card gets the focus ring on load', async ({ page }) => {
	const focused = page.locator('.list-pane .card.focused');
	await expect(focused).toHaveCount(1);
	await expect(focused).toContainText('企画A');
	await expect(page.locator('.layout')).toHaveAttribute('data-active-col', 'project');
});

test('j / k stop at the boundary and keep the ring visible', async ({ page }) => {
	const focused = page.locator('.list-pane .card.focused');
	await expect(focused).toContainText('企画A');
	await page.keyboard.press('j');
	await expect(focused).toHaveCount(1);
	await expect(focused).toContainText('企画A');
	await page.keyboard.press('k');
	await expect(focused).toHaveCount(1);
	await expect(focused).toContainText('企画A');
});
