import { BODY_REGIONS } from '@/data/bodyRegions';
import { readingKey, riskToStatus } from '@/lib/status';
import type { ReadingMap, RegionReading } from '@/types';
import type { TelemetrySource } from './types';

const HEADLINES = {
  skeletal: 'Bone loading',
  cardiovascular: 'Fluid shift',
  nervous: 'Cognitive and radiation load',
} as const;

/** Random-walk simulator: smooth drift so heatmap colors change gradually. */
export function createMockTelemetry(intervalMs = 2000): TelemetrySource {
  const risk = new Map<string, number>();

  return {
    subscribe(onBatch) {
      const tick = () => {
        const batch: ReadingMap = {};
        const now = Date.now();
        for (const region of BODY_REGIONS) {
          for (const layer of region.layers) {
            const key = readingKey(layer, region.id);
            const prev = risk.get(key) ?? 0.15 + Math.random() * 0.5;
            const next = Math.min(1, Math.max(0, prev + (Math.random() - 0.5) * 0.08));
            risk.set(key, next);
            const reading: RegionReading = {
              regionId: region.id,
              layer,
              risk: next,
              status: riskToStatus(next),
              headline: `${HEADLINES[layer]}: ${Math.round(next * 100)}% of limit`,
              detail: `Simulated ${layer} reading for ${region.label.toLowerCase()}.`,
              updatedAt: now,
            };
            batch[key] = reading;
          }
        }
        onBatch(batch);
      };
      tick();
      const id = setInterval(tick, intervalMs);
      return () => clearInterval(id);
    },
  };
}
