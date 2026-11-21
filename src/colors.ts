// Ten distinct island colours; beyond ten islands they repeat.
export const ISLAND_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#8f6ae0', '#16a0bd', '#a5713f', '#9aa524'];

export const islandColor = (island: number) => ISLAND_COLORS[island % ISLAND_COLORS.length]!;

// The mockup's heatmap shades, from dark (low) to light (high).
const HEAT = ['#13243a', '#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4'];
// The first shade light enough to need dark text.
const DARK_TEXT_FROM = 7;

const heatStep = (t: number) => Math.max(0, Math.min(HEAT.length - 1, Math.round(t * (HEAT.length - 1))));

export const heatColor = (t: number) => HEAT[heatStep(t)]!;

export const heatInk = (t: number) => (heatStep(t) >= DARK_TEXT_FROM ? '#0b1220' : '#f5f7fb');
