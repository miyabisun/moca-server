import { test, expect } from '@playwright/test';
import { bootLines, project, line } from './helpers.js';

// Coverage item 7: a / i open TextEditModal with the caret at the end (a) or start
// (i); confirming an edit on a 演技 line re-runs /analyze. App.svelte openTextEdit
// 386-391, commitTextEdit 234-243, TextEditModal focusInput 16-20.

const caretFixture = () => ({ projects: [project('企画A', [line('announcer', 'あいう', { id: 'a1' })])] });

test('a places the caret at the end of the text', async ({ page }) => {
	await bootLines(page, caretFixture());

	await page.keyboard.press('a');
	const input = page.getByLabel('行テキスト');
	await expect(input).toBeFocused();
	const atEnd = await input.evaluate(
		(el) => el.selectionStart === el.value.length && el.selectionEnd === el.value.length
	);
	expect(atEnd).toBe(true);
});

test('i places the caret at the start of the text', async ({ page }) => {
	await bootLines(page, caretFixture());

	await page.keyboard.press('i');
	const input = page.getByLabel('行テキスト');
	await expect(input).toBeFocused();
	const atStart = await input.evaluate(
		(el) => el.selectionStart === 0 && el.selectionEnd === 0
	);
	expect(atStart).toBe(true);
});

test('confirming an edit on a 演技 line re-runs /analyze', async ({ page }) => {
	const { requests } = await bootLines(page, {
		projects: [project('企画A', [line('acting', '演技行', { id: 'x', script: [{ happy: 1 }] })])]
	});

	await page.keyboard.press('a');
	const input = page.getByLabel('行テキスト');
	await input.fill('書き換えた演技行');
	await input.press('Enter');

	await expect(page.getByLabel('行テキスト')).toHaveCount(0); // modal closed
	await expect(page.locator('.detail-pane .row .text')).toHaveText('書き換えた演技行');
	expect(requests.some((r) => r.path === '/analyze' && r.text === '書き換えた演技行')).toBe(true);
});
