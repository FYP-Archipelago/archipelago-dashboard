export const TOPOLOGIES: Record<string, string> = {
  ring: 'Ring',
  bidirectional_ring: 'Bidirectional Ring',
  fully_connected: 'Fully Connected',
  lattice: 'Lattice',
  random: 'Random',
  star: 'Star',
  torus: 'Torus',
};

export const numberFormat = new Intl.NumberFormat('en');

export const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const fitnessFormat = new Intl.NumberFormat('en', { maximumSignificantDigits: 6 });

// Fitness ranges from tour lengths in the thousands to errors near zero, so very large and very small values switch to e-notation.
export function fitness(value: number | null): string {
  if (value === null) return '—';
  const size = Math.abs(value);
  if (size !== 0 && (size >= 1e7 || size < 1e-3)) return value.toExponential(3);
  return fitnessFormat.format(value);
}

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const dateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

export function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function duration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
