import { defineConfig, devices } from '@playwright/test';

// E2E runs against the Vite build (served by `vite preview`). Every backend call
// is mocked per-test via page.route, so the Rust server + VOICEPEAK are not
// needed. Browser: Chromium (Obscura's CDP lacks request interception — see the
// global CLAUDE.md). A dedicated port (4173) avoids colliding with dev (5174).
export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	use: {
		baseURL: 'http://localhost:4173',
		// Sumi is the primary theme (:root in global.sass); light is the Washi
		// secondary. Playwright defaults to light, so pin dark to test Sumi first.
		colorScheme: 'dark',
		// Verify the design's static ON state (color only). The megaphone breathing
		// stops under reduced motion, keeping assertions deterministic.
		reducedMotion: 'reduce'
	},
	webServer: {
		command: 'bun run build && bun run preview --port 4173 --strictPort',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120000
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
