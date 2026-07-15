import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import path from 'path';

// moca-server runs on port 3000; dev proxies the API + synthesis routes to it.
export default defineConfig({
	plugins: [svelte({ preprocess: vitePreprocess() })],
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib')
		}
	},
	base: './',
	build: {
		outDir: 'build'
	},
	server: {
		host: '0.0.0.0',
		port: 5174,
		proxy: {
			'/api': 'http://localhost:3000',
			'/say': 'http://localhost:3000',
			'/analyze': 'http://localhost:3000',
			'/notify': 'http://localhost:3000',
			// /work はタブの URL なので、プロキシは API パスだけに絞る
			'/work/talk': 'http://localhost:3000',
			'/moca-assets': 'http://localhost:3000'
		}
	}
});
