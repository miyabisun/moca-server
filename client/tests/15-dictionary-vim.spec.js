import { test, expect } from '@playwright/test';
import { dictionaryEntry, installApi, silentWav } from './helpers.js';

const fixture = () => ({
	dictionary: [
		dictionaryEntry('API', 'エーピーアイ', { id: 'api' }),
		dictionaryEntry('GPU', 'ジーピーユー', { id: 'gpu' }),
		dictionaryEntry('URL', 'ユーアールエル', { id: 'url' })
	]
});

async function bootDictionary(page, options = {}) {
	const api = await installApi(page, { ...fixture(), ...options });
	await page.goto('/dict');
	await expect(page.locator('tbody tr')).toHaveCount(options.dictionary?.length ?? 3);
	return api;
}

test('j/k and h/l move the visible dictionary cursor with boundary guards', async ({ page }) => {
	await bootDictionary(page);
	const focused = page.locator('tbody tr.focused');

	await expect(focused).toContainText('API');
	await expect(focused.locator('td.cell-focused')).toHaveAttribute('data-column', 'surface');
	await page.keyboard.press('k');
	await expect(focused).toContainText('API');
	await page.keyboard.press('j');
	await expect(focused).toContainText('GPU');
	await page.keyboard.press('l');
	await expect(focused.locator('td.cell-focused')).toHaveAttribute('data-column', 'reading');
	await page.keyboard.press('h');
	await expect(focused.locator('td.cell-focused')).toHaveAttribute('data-column', 'surface');
});

test('dd deletes without a dialog and follows the filtered result cursor', async ({ page }) => {
	const { requests } = await bootDictionary(page);
	await page.keyboard.press('/');
	const search = page.getByLabel('辞書を検索');
	await search.fill('P'); // API + GPU, excluding URL
	await expect(page.locator('tbody tr')).toHaveCount(2);
	await page.locator('tbody tr.focused').click(); // leave the filter visible and return to vim mode

	await page.keyboard.press('d');
	await page.keyboard.press('d');

	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await expect(page.locator('tbody tr.focused')).toContainText('GPU');
	expect(requests.some((r) => r.method === 'DELETE' && r.path === '/api/dictionary/api')).toBe(
		true
	);
});

test('o opens an add modal, upserts, sorts, and reveals the saved row', async ({ page }) => {
	const { requests } = await bootDictionary(page);
	await page.keyboard.press('/');
	await page.getByLabel('辞書を検索').fill('GPU');
	await page.getByLabel('辞書を検索').press('Escape');
	await page.keyboard.press('o');

	await expect(page.getByRole('dialog')).toContainText('辞書項目を追加');
	await page.getByRole('textbox', { name: '表記' }).fill('CPU');
	await page.getByRole('textbox', { name: '読み' }).fill('シーピーユー');
	await page.getByRole('button', { name: '追加', exact: true }).click();

	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('tbody tr')).toHaveCount(4); // filter cleared because CPU did not match GPU
	await expect(page.locator('tbody tr.focused')).toContainText('CPU');
	await expect(page.locator('tbody tr').nth(1)).toContainText('CPU');
	expect(
		requests.some(
			(r) => r.method === 'POST' && r.path === '/api/dictionary' && r.json?.surface === 'CPU'
		)
	).toBe(true);

	await page.keyboard.press('o');
	await page.getByRole('textbox', { name: '表記' }).fill('GPU');
	await page.getByRole('textbox', { name: '読み' }).fill('グラフィックス');
	await page.getByRole('button', { name: '追加', exact: true }).click();
	await expect(page.locator('tbody tr')).toHaveCount(4);
	await expect(page.locator('tbody tr.focused')).toContainText('グラフィックス');
});

test('a/i edit the focused cell with the requested caret and keep the row id', async ({ page }) => {
	const { requests } = await bootDictionary(page);
	await page.keyboard.press('a');
	let input = page.getByRole('textbox', { name: '表記を編集' });
	await expect(input).toBeFocused();
	expect(
		await input.evaluate((el) => el.selectionStart === el.value.length && el.selectionEnd === el.value.length)
	).toBe(true);
	await input.fill('ZAPI');
	await input.press('Enter');
	await expect(page.locator('tbody tr.focused')).toContainText('ZAPI');

	await page.keyboard.press('l');
	await page.keyboard.press('i');
	input = page.getByRole('textbox', { name: '読みを編集' });
	await expect(input).toBeFocused();
	expect(await input.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === 0)).toBe(true);
	await input.fill('ゼットエーピーアイ');
	await input.press('Enter');
	await expect(page.locator('tbody tr.focused')).toContainText('ゼットエーピーアイ');

	const patches = requests.filter(
		(r) => r.method === 'PATCH' && r.path === '/api/dictionary/api'
	);
	expect(patches.map((r) => r.json)).toEqual([
		{ surface: 'ZAPI', reading: 'エーピーアイ' },
		{ surface: 'ZAPI', reading: 'ゼットエーピーアイ' }
	]);
});

test('Space previews the focused reading and / performs fuzzy subsequence search', async ({ page }) => {
	const { requests } = await bootDictionary(page, { ...fixture(), sayAudio: silentWav() });
	await page.keyboard.press(' ');
	await expect(page.locator('tbody tr.focused .icon-btn.active')).toBeVisible();
	await expect
		.poll(() => requests.some((r) => r.path === '/say' && r.method === 'GET'))
		.toBe(true);
	await page.keyboard.press(' ');
	await expect(page.locator('tbody tr.focused .icon-btn.active')).toHaveCount(0);

	await page.keyboard.press('/');
	const search = page.getByLabel('辞書を検索');
	await expect(search).toBeFocused();
	await search.fill('GP'); // non-contiguous match: GPU
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await expect(page.locator('tbody tr.focused')).toContainText('GPU');
	await search.press('Escape');
	await expect(search).toHaveCount(0);
	await expect(page.locator('tbody tr')).toHaveCount(3);
});

test('a conflicting surface edit keeps the attempted value open for correction', async ({ page }) => {
	await bootDictionary(page);
	await page.keyboard.press('a');
	const input = page.getByRole('textbox', { name: '表記を編集' });
	await input.fill('GPU');
	await input.press('Enter');

	await expect(input).toBeVisible();
	await expect(input).toHaveValue('GPU');
	await expect(page.locator('.toast.danger')).toContainText('surface already exists');
	await expect(page.locator('tbody tr.focused')).toContainText('API');
});

test('o and / remain available for an empty dictionary', async ({ page }) => {
	await bootDictionary(page, { dictionary: [] });
	await page.keyboard.press('/');
	await expect(page.getByLabel('辞書を検索')).toBeFocused();
	await page.getByLabel('辞書を検索').press('Escape');
	await page.keyboard.press('o');
	await expect(page.getByRole('dialog')).toContainText('辞書項目を追加');
});
