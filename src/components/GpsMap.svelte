<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/store.svelte';

	let mapEl: HTMLDivElement;
	let map: any = $state(null);
	let trackLayer: any = $state(null);
	let highlightLayer: any = $state(null);

	onMount(async () => {
		if (!store.data || store.data.gpsTrack.length === 0) return;

		const L = (await import('leaflet')).default;
		await import('leaflet/dist/leaflet.css');

		map = L.map(mapEl, {
			center: store.data.gpsTrack[0],
			zoom: 13,
			zoomControl: true,
			attributionControl: true,
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: 18,
		}).addTo(map);

		trackLayer = L.polyline(store.data.gpsTrack, {
			color: '#3498db',
			weight: 3,
			opacity: 0.6,
		}).addTo(map);

		highlightLayer = L.polyline([], {
			color: '#e74c3c',
			weight: 4,
			opacity: 0.9,
		}).addTo(map);

		map.fitBounds(trackLayer.getBounds(), { padding: [20, 20] });

		return () => {
			map?.remove();
		};
	});

	$effect(() => {
		if (!map || !trackLayer || !highlightLayer || !store.data) return;
		if (store.data.gpsTrack.length === 0) return;

		const range = store.selectionRange;
		if (!range) {
			highlightLayer.setLatLngs([]);
			return;
		}

		const records = store.data.records;
		const gpsTrack = store.data.gpsTrack;

		const totalRecords = records.length;
		const startFrac = range.startIndex / totalRecords;
		const endFrac = range.endIndex / totalRecords;
		const startGpsIdx = Math.floor(startFrac * gpsTrack.length);
		const endGpsIdx = Math.ceil(endFrac * gpsTrack.length);

		const selectedPoints = gpsTrack.slice(startGpsIdx, endGpsIdx);
		if (selectedPoints.length > 1) {
			highlightLayer.setLatLngs(selectedPoints);
		} else {
			highlightLayer.setLatLngs([]);
		}
	});
</script>

{#if store.data && store.data.gpsTrack.length > 1}
	<div class="map-container">
		<div class="map-label">GPS Track</div>
		<div bind:this={mapEl} class="map-el"></div>
	</div>
{/if}

<style>
	.map-container {
		background: var(--surface);
		border-radius: 12px;
		border: 1px solid var(--border-color);
		overflow: hidden;
	}

	.map-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.map-el {
		height: 280px;
		width: 100%;
	}

	@media (max-width: 768px) {
		.map-el {
			height: 220px;
		}
	}
</style>
