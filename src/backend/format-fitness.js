const compact = new Intl.NumberFormat('en', {maximumFractionDigits: 4});
const small = new Intl.NumberFormat('en', {maximumSignificantDigits: 5, notation: 'standard'});

export function formatFitness(value) {
  return (value !== 0 && Math.abs(value) < 0.001 ? small : compact).format(value);
}
