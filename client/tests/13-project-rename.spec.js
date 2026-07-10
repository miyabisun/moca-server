import { test, expect } from '@playwright/test';
import { installApi, project, line } from './helpers.js';

// Coverage item 13: a / i in the プロジェクト column edit the focused project's
// title (caret end / start), even when that project is not open. Commit issues
// PATCH /api/projects/:id { name } for the focused project and the list reflects
// it. App.svelte openProjectEdit / commitProjectEdit, TextEditModal reuse.

const one = () => ({ projects: [project('企画A', [line('announcer', '行', { id: 'a1' })])] });

test('a opens the project-title editor with the caret at the end', async ({ page }) => {
	await installApi(page, one());
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toContainText('企画A');

	await page.keyboard.press('a');
	const input = page.getByLabel('プロジェクト名');
	await expect(input).toBeFocused();
	await expect(page.locator('.notice')).toHaveCount(0); // no re-analyze notice here
	const atEnd = await input.evaluate(
		(el) => el.selectionStart === el.value.length && el.selectionEnd === el.value.length
	);
	expect(atEnd).toBe(true);
});

test('i opens the project-title editor with the caret at the start', async ({ page }) => {
	await installApi(page, one());
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toContainText('企画A');

	await page.keyboard.press('i');
	const input = page.getByLabel('プロジェクト名');
	await expect(input).toBeFocused();
	const atStart = await input.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === 0);
	expect(atStart).toBe(true);
});

test('a / i edit an unopened project and PATCH the focused id', async ({ page }) => {
	const { store, requests } = await installApi(page, {
		projects: [
			project('企画A', [line('announcer', 'a', { id: 'a1' })]),
			project('企画B', [line('announcer', 'b', { id: 'b1' })])
		]
	});
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toContainText('企画A');
	const bId = store.projects[1].id;

	// Move the cursor to 企画B WITHOUT opening it (no Enter): the workspace stays on
	// the placeholder, proving the focused-but-unopened project is editable.
	await page.keyboard.press('j');
	await expect(page.locator('.list-pane .card.focused')).toContainText('企画B');
	await expect(page.locator('.placeholder')).toBeVisible();

	await page.keyboard.press('a');
	const input = page.getByLabel('プロジェクト名');
	await expect(input).toHaveValue('企画B');
	await input.fill('企画B改');
	await input.press('Enter');

	await expect(page.getByLabel('プロジェクト名')).toHaveCount(0); // modal closed
	const patch = requests.find(
		(r) => r.method === 'PATCH' && r.path.startsWith('/api/projects/')
	);
	expect(patch.path).toBe(`/api/projects/${bId}`); // the focused project, not 企画A
	expect(patch.json).toEqual({ name: '企画B改' });

	await expect(page.locator('.list-pane .card', { hasText: '企画B改' })).toBeVisible();
});
