<script>
	import { onDestroy, onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	// App-global notification subscribe toggle (header, far right). ON opens an SSE
	// stream to /notify/stream; each pushed text is spoken via a PRIVATE audio
	// element pointed at /say (text/plain, no /analyze — read plain for latency).
	// Completely independent from the line-player: notifications may sound on top
	// of a running line or radio playback. Serial FIFO, no queue cap.
	let subscribed = $state(false);
	let connected = $state(false);

	let es = null; // EventSource
	let audio = null; // private HTMLAudioElement, distinct from the line-player
	let queue = [];
	let playing = false;
	let lastWakeCheck = Date.now();
	let wakeTimer = null;

	const WAKE_CHECK_MS = 5_000;
	const SLEEP_GAP_MS = 30_000;

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

	function openStream() {
		es?.close();
		connected = false;

		const stream = new EventSource('/notify/stream');
		es = stream;
		stream.onopen = () => {
			if (es === stream) connected = true;
		};
		stream.onerror = () => {
			// EventSource retries transport errors itself. Keep showing the desired
			// subscription as pressed while making the disconnected state visible.
			if (es === stream) connected = false;
		};
		stream.onmessage = (e) => enqueue(e.data);
	}

	function reconnect() {
		if (subscribed) openStream();
	}

	function subscribe() {
		// (a) Unlock autoplay synchronously inside the user gesture (Safari policy).
		new Audio().play().catch(() => {});
		// (b) Open the SSE stream.
		openStream();
	}

	function unsubscribe() {
		es?.close();
		es = null;
		connected = false;
	}

	function onVisibilityChange() {
		if (document.visibilityState === 'visible') reconnect();
	}

	function checkForSleep() {
		const now = Date.now();
		if (now - lastWakeCheck > SLEEP_GAP_MS && document.visibilityState === 'visible') {
			reconnect();
		}
		lastWakeCheck = now;
	}

	// Exported so App.svelte's global `n` shortcut can drive the same toggle as the
	// button. Called synchronously from the keydown handler (a user gesture), which
	// keeps subscribe()'s Audio autoplay unlock valid — do not await before this.
	export function toggle() {
		subscribed = !subscribed;
		if (subscribed) subscribe();
		else unsubscribe();
	}

	onMount(() => {
		window.addEventListener('online', reconnect);
		window.addEventListener('pageshow', reconnect);
		document.addEventListener('resume', reconnect);
		document.addEventListener('visibilitychange', onVisibilityChange);
		wakeTimer = window.setInterval(checkForSleep, WAKE_CHECK_MS);
	});

	onDestroy(() => {
		es?.close();
		window.removeEventListener('online', reconnect);
		window.removeEventListener('pageshow', reconnect);
		document.removeEventListener('resume', reconnect);
		document.removeEventListener('visibilitychange', onVisibilityChange);
		if (wakeTimer != null) window.clearInterval(wakeTimer);
	});
</script>

<button
	type="button"
	class="megaphone"
	class:on={connected}
	class:connecting={subscribed && !connected}
	aria-pressed={subscribed}
	aria-label={connected
		? '通知購読中、押すと解除'
		: subscribed
			? '通知に接続中、押すと解除'
			: '通知を購読'}
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

	// Subscription is still desired, but the SSE transport is not open yet.
	// Keep the same semantic color family while making it visibly distinct from ON.
	&.connecting
		color: var(--c-secondary)

		:global(.icon)
			opacity: 0.45

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
