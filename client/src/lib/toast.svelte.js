let toasts = $state([]);
let nextId = 0;

export function addToast(message, role = 'info') {
	const id = nextId++;
	toasts = [...toasts, { id, message, role }];
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, 2500);
}

export function getToasts() {
	return toasts;
}
