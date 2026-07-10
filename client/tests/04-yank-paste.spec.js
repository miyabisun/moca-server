import { test, expect } from '@playwright/test';
import { bootLines, project, line } from './helpers.js';

// Coverage item 4: yy then p / P. A yank followed by paste must issue addLine
// (POST) with the yanked payload and reorderLines (PUT) placing the copy at the
// right slot. App.svelte yankFocusedLine 327-330, insertLineAt 354-368.

const fixture = () => ({
	projects: [
		project('企画A', [
			line('announcer', 'A行', { id: 'A' }),
			line('announcer', 'B行', { id: 'B' })
		])
	]
});

const reorderOf = (requests) =>
	requests.filter((r) => r.method === 'PUT' && r.path.endsWith('/lines/order')).pop();
const addOf = (requests) =>
	requests.filter((r) => r.method === 'POST' && r.path.endsWith('/lines')).pop();

test('yy then p pastes the copy below the cursor', async ({ page }) => {
	const { requests } = await bootLines(page, fixture()); // cursor on A

	await page.keyboard.press('y');
	await page.keyboard.press('y');
	await page.keyboard.press('p');

	await expect(page.locator('.detail-pane .row')).toHaveCount(3);

	const add = addOf(requests);
	expect(add.json).toMatchObject({ mode: 'announcer', text: 'A行' });

	const order = reorderOf(requests).json.order;
	expect(order).toHaveLength(3);
	expect(order[0]).toBe('A');
	expect(order[2]).toBe('B');
	expect(['A', 'B']).not.toContain(order[1]); // the new copy sits between A and B
});

test('yy then P pastes the copy above the cursor', async ({ page }) => {
	const { requests } = await bootLines(page, fixture()); // cursor on A

	await page.keyboard.press('y');
	await page.keyboard.press('y');
	await page.keyboard.press('P');

	await expect(page.locator('.detail-pane .row')).toHaveCount(3);

	const order = reorderOf(requests).json.order;
	expect(order).toHaveLength(3);
	expect(order[1]).toBe('A');
	expect(order[2]).toBe('B');
	expect(['A', 'B']).not.toContain(order[0]); // the new copy sits above A
});
