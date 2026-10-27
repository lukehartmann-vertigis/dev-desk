/** Presents a UTC timestamp in the browser's locale, retaining the never-synchronized state. */
export function formatTimestamp(value: string | null) {
	return value ? new Date(value).toLocaleString() : 'Never synchronized';
}
