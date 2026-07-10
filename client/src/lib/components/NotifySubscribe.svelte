<script>
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	// App-global notification subscribe toggle (header, far right). ON opens an SSE
	// stream to /notify/stream; each pushed text is spoken via a PRIVATE audio
	// element pointed at /say (text/plain, no /analyze — read plain for latency).
	// Completely independent from the line-player: notifications may sound on top
	// of a running line or radio playback. Serial FIFO, no queue cap.
	let subscribed = $state(false);

	let es = null; // EventSource
	let audio = null; // private HTMLAudioElement, distinct from the line-player
	let queue = [];
	let playing = false;

	function enqueue(text) {
		if (!text) return;
		queue.push(text);
		drain();
	}

	async function drain() {
		if (playing) return;
		const text = queue.shift();
		if (text == null) return;
		playing = true;
		let url = null;
		try {
			const res = await fetch('/say', {
				method: 'POST',
				headers: { 'content-type': 'text/plain' },
				body: text
			});
			if (!res.ok) throw new Error(`/say ${res.status}`);
			const blob = await res.blob();
			url = URL.createObjectURL(blob);
			audio ??= new Audio();
			audio.src = url;
			await new Promise((resolve) => {
				audio.onended = resolve;
				audio.onerror = resolve;
				audio.play().catch(resolve);
			});
		} catch {
			// fire-and-forget: swallow and move to the next arrival
		} finally {
			if (url) URL.revokeObjectURL(url);
			playing = false;
			if (queue.length) drain();
		}
	}

	function subscribe() {
		// (a) Unlock autoplay synchronously inside the user gesture (Safari policy).
		new Audio().play().catch(() => {});
		// (b) Open the SSE stream.
		es = new EventSource('/notify/stream');
		es.onmessage = (e) => enqueue(e.data);
	}

	function unsubscribe() {
		es?.close();
		es = null;
	}

	// Exported so App.svelte's global `n` shortcut can drive the same toggle as the
	// button. Called synchronously from the keydown handler (a user gesture), which
	// keeps subscribe()'s Audio autoplay unlock valid — do not await before this.
	export function toggle() {
		subscribed = !subscribed;
		if (subscribed) subscribe();
		else unsubscribe();
	}

	onDestroy(() => es?.close());
</script>

<button
	type="button"
	class="megaphone"
	class:on={subscribed}
	aria-pressed={subscribed}
	aria-label={subscribed ? '通知購読を解除' : '通知を購読'}
	onclick={toggle}
>
	<Icon name={subscribed ? 'megaphone' : 'megaphone-off'} />
</button>

<style lang="sass">
// Header far-right: template quiet icon-button, 36px (matches the line play button).
.megaphone
	display: flex
	align-items: center
	justify-content: center
	flex: none
	margin-left: auto
	width: 36px
	height: 36px
	padding: 0
	border: none
	border-radius: var(--radius-sm)
	background: transparent
	color: var(--c-text-muted)
	cursor: pointer

	&:hover
		background: var(--c-hover-secondary)

	// ON = subscribed: emerald secondary + slow opacity breathing. The breathing
	// animation is applied to the icon (not the button itself) so the focus ring
	// never flickers. It runs in both themes; only prefers-reduced-motion (below)
	// suspends it, and the ON color alone then carries the state.
	&.on
		color: var(--c-secondary)

		:global(.icon)
			animation: breathe 2s ease-in-out infinite alternate

@keyframes breathe
	from
		opacity: 0.6
	to
		opacity: 1

// Accessibility: no breathing when the user asked for reduced motion — the ON
// color still conveys the subscribed state.
@media (prefers-reduced-motion: reduce)
	.megaphone.on :global(.icon)
		animation: none
</style>
