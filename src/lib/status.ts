import type { Status } from '@/types';

export const THRESHOLDS = { caution: 0.4, critical: 0.7 } as const;

export function riskToStatus(risk: number): Status {
  if (risk >= THRESHOLDS.critical) return 'critical';
  if (risk >= THRESHOLDS.caution) return 'caution';
  return 'nominal';
}

/** Mirrors tokens.css so 3D materials use the same palette as the DOM. */
export const STATUS_HEX: Record<Status, string> = {
  nominal: '#22e6ff',
  caution: '#ffb020',
  critical: '#ff3b4e',
};

export const readingKey = (layer: string, region: string) => `${layer}:${region}` as const;
