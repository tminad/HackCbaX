export function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

export function nonNegative(name: string, value: number): number {
  finite(name, value);
  if (value < 0) throw new RangeError(`${name} must be non-negative`);
  return value;
}

export function positive(name: string, value: number): number {
  nonNegative(name, value);
  if (value === 0) throw new RangeError(`${name} must be positive`);
  return value;
}
