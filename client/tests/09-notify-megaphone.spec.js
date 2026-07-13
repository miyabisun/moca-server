import { test, expect } from '@playwright/test';
import { installApi, project, line } from './helpers.js';

// Coverage item 9: n toggles the header notify megaphone. The pressed state is
// the user's subscription intent; `connecting` / `on` reflect the actual SSE
// lifecycle. A sleep-sized clock gap or network recovery event must replace a
// possibly stale stream.

async function installEventSource(page) {
	await page.addInitScript(() => {
		let now = Date.now();
		Date.now = () => now;
		window.__advanceTime = (milliseconds) => {
			now += milliseconds;
		};

		const nativeSetInterval = window.setInterval.bind(window);
		window.setInterval = (handler, timeout, ...args) => {
			if (timeout === 5_000) window.__wakeCheck = handler;
			return nativeSetInterval(handler, timeout, ...args);
		};

		class FakeEventSource {
			static instances = [];

			constructor(url) {
				this.url = url;
				this.closed = false;
				FakeEventSource.instances.push(this);
			}

			close() {
				this.closed = true;
			}

			open() {
				this.onopen?.(new Event('open'));
			}

			fail() {
				this.onerror?.(new Event('error'));
			}

			message(data) {
				this.onmessage?.({ data });
			}
		}

		window.EventSource = FakeEventSource;
		window.__eventSources = FakeEventSource.instances;
	});
}

test('megaphone tracks the connection and recovers after sleep or network loss', async ({ page }) => {
	await installEventSource(page);
	const { requests } = await installApi(page, {
		projects: [project('企画A', [line('announcer', '行', { id: 'a1' })])]
	});
	await page.goto('/');
	await expect(page.locator('.list-pane .card.focused')).toBeVisible();

	const megaphone = page.locator('.megaphone');
	await expect(megaphone).toHaveAttribute('aria-pressed', 'false');

	await page.keyboard.press('n');
	await expect(megaphone).toHaveAttribute('aria-pressed', 'true');
	await expect(megaphone).toHaveAttribute('aria-label', '通知に接続中、押すと解除');
	await expect(megaphone).toHaveClass(/\bconnecting\b/);
	await expect(megaphone).not.toHaveClass(/\bon\b/);
	await expect.poll(() => page.evaluate(() => window.__eventSources.length)).toBe(1);

	await page.evaluate(() => window.__eventSources[0].open());
	await expect(megaphone).toHaveAttribute('aria-label', '通知購読中、押すと解除');
	await expect(megaphone).toHaveClass(/\bon\b/);
	await expect(megaphone).not.toHaveClass(/\bconnecting\b/);

	await page.evaluate(() => window.__eventSources[0].fail());
	await expect(megaphone).toHaveAttribute('aria-label', '通知に接続中、押すと解除');
	await expect(megaphone).toHaveClass(/\bconnecting\b/);

	await page.evaluate(() => {
		window.__eventSources[0].open();
		window.__advanceTime(31_000);
		window.__wakeCheck();
	});
	await expect.poll(() => page.evaluate(() => window.__eventSources.length)).toBe(2);
	await expect.poll(() => page.evaluate(() => window.__eventSources[0].closed)).toBe(true);
	await expect(megaphone).toHaveClass(/\bconnecting\b/);

	await page.evaluate(() => window.__eventSources[1].open());
	await expect(megaphone).toHaveClass(/\bon\b/);

	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect.poll(() => page.evaluate(() => window.__eventSources.length)).toBe(3);
	await expect.poll(() => page.evaluate(() => window.__eventSources[1].closed)).toBe(true);
	await page.evaluate(() => window.__eventSources[2].open());

	await page.evaluate(() => window.__eventSources[2].message('復旧後の通知'));
	await expect
		.poll(() => requests.some((r) => r.method === 'POST' && r.path === '/say' && r.text === '復旧後の通知'))
		.toBe(true);

	await page.keyboard.press('n');
	await expect(megaphone).toHaveAttribute('aria-pressed', 'false');
	await expect(megaphone).not.toHaveClass(/\bon\b/);
	await expect.poll(() => page.evaluate(() => window.__eventSources[2].closed)).toBe(true);

	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect.poll(() => page.evaluate(() => window.__eventSources.length)).toBe(3);
});
