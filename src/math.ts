export const minOf = (values: readonly number[], empty = Infinity) => values.reduce((low, value) => (value < low ? value : low), empty);

export const maxOf = (values: readonly number[], empty = -Infinity) => values.reduce((high, value) => (value > high ? value : high), empty);
