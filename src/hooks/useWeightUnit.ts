import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

export type WeightUnit = 'kg' | 'lbs';

const STORAGE_KEY = 'adaptitrain_weight_unit';

function readStoredUnit(): WeightUnit {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'kg' || stored === 'lbs') return stored;
    }
  } catch {}
  return 'kg'; // default
}

function writeStoredUnit(unit: WeightUnit) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, unit);
    }
  } catch {}
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/** Convert a stored-lbs value to the display unit */
export function convertWeight(valueLbs: number, toUnit: WeightUnit): number {
  if (toUnit === 'kg') return Math.round((valueLbs / 2.20462) * 10) / 10;
  return Math.round(valueLbs * 10) / 10;
}

/** Convert a user-entered value (in displayUnit) to lbs for storage */
export function toStorageLbs(value: number, fromUnit: WeightUnit): number {
  if (fromUnit === 'kg') return Math.round(value * 2.20462 * 10) / 10;
  return Math.round(value * 10) / 10;
}

/**
 * Parse a weight string like "60kg", "135 lbs", "80", "bodyweight" and
 * return a display string in the target unit.
 * Returns the original string if it can't be parsed (e.g. "bodyweight", "BW").
 */
export function convertWeightString(weightStr: string, toUnit: WeightUnit): string {
  if (!weightStr) return weightStr;

  const lower = weightStr.toLowerCase().trim();

  // Bodyweight — no conversion needed
  if (/^(bw|bodyweight|body weight|body)$/i.test(lower)) return weightStr;

  // Try to parse: number + optional unit, ignoring any trailing descriptive text (e.g. "25 lbs added")
  const match = lower.match(/^([\d.]+)\s*(kg|kgs|lbs?|pounds?)?/i);
  if (!match) return weightStr; // can't parse — return as-is

  const num = parseFloat(match[1]);
  if (isNaN(num)) return weightStr;

  const srcUnit = match[2]
    ? /^kg/i.test(match[2]) ? 'kg' : 'lbs'
    : toUnit; // if no unit suffix, assume it's already in target unit

  if (srcUnit === toUnit) {
    // Already in right unit — just clean up the label
    return `${num}${toUnit}`;
  }

  // Convert
  if (srcUnit === 'kg' && toUnit === 'lbs') {
    const converted = Math.round(num * 2.20462 * 10) / 10;
    return `${converted}lbs`;
  } else {
    const converted = Math.round((num / 2.20462) * 10) / 10;
    return `${converted}kg`;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

let _globalUnit: WeightUnit = readStoredUnit();
const _listeners: Array<(u: WeightUnit) => void> = [];

/** Call all listeners when unit changes so all mounted components re-render */
function setGlobalUnit(unit: WeightUnit) {
  _globalUnit = unit;
  writeStoredUnit(unit);
  _listeners.forEach((fn) => fn(unit));
}

export function useWeightUnit() {
  const [unit, setUnitLocal] = useState<WeightUnit>(_globalUnit);

  const toggle = useCallback(() => {
    const next: WeightUnit = _globalUnit === 'kg' ? 'lbs' : 'kg';
    setGlobalUnit(next);
    setUnitLocal(next);
  }, []);

  // Register / unregister listener so this component re-renders on global change
  useState(() => {
    const listener = (u: WeightUnit) => setUnitLocal(u);
    _listeners.push(listener);
    return () => {
      const idx = _listeners.indexOf(listener);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  });

  return { unit, toggle, convertWeightString: (s: string) => convertWeightString(s, unit) };
}
