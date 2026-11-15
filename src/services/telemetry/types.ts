import type { ReadingMap } from '@/types';

/** Swap the mock for a WebSocket/REST source by implementing only this. */
export interface TelemetrySource {
  subscribe(onBatch: (readings: ReadingMap) => void): () => void;
}
