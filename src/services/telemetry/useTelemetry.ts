import { useEffect } from 'react';
import { useTwinStore } from '@/store/useTwinStore';
import { createMockTelemetry } from './mockTelemetry';
import type { TelemetrySource } from './types';

/** Mount once at the app root. */
export function useTelemetry(source: TelemetrySource = createMockTelemetry()) {
  const apply = useTwinStore((s) => s.applyReadings);
  useEffect(() => source.subscribe(apply), []); // eslint-disable-line react-hooks/exhaustive-deps
}
