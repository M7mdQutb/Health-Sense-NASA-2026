import { create } from 'zustand';
import type { LayerId, ReadingMap, RegionId, Severity, SymptomLog } from '@/types';

/**
 * The single hub every module talks through. The 3D scene, sidebar, symptom
 * logger and gamification never import each other: they read and write here.
 */
interface TwinState {
  activeLayer: LayerId;
  selectedRegionId: RegionId | null;
  hoveredRegionId: RegionId | null;
  readings: ReadingMap;
  symptoms: SymptomLog[];
  /** When true, a tap on the body opens the logger instead of the strain detail. */
  loggingMode: boolean;

  setLayer: (layer: LayerId) => void;
  selectRegion: (id: RegionId | null) => void;
  hoverRegion: (id: RegionId | null) => void;
  applyReadings: (batch: ReadingMap) => void;
  setLoggingMode: (on: boolean) => void;
  logSymptom: (regionId: RegionId, severity: Severity, note?: string) => void;
}

export const useTwinStore = create<TwinState>((set) => ({
  activeLayer: 'skeletal',
  selectedRegionId: null,
  hoveredRegionId: null,
  readings: {},
  symptoms: [],
  loggingMode: false,

  // Switching layer clears the selection so the drawer never shows a hidden region.
  setLayer: (activeLayer) => set({ activeLayer, selectedRegionId: null }),
  selectRegion: (selectedRegionId) => set({ selectedRegionId }),
  hoverRegion: (hoveredRegionId) => set({ hoveredRegionId }),
  applyReadings: (batch) => set((s) => ({ readings: { ...s.readings, ...batch } })),
  setLoggingMode: (loggingMode) => set({ loggingMode }),
  logSymptom: (regionId, severity, note) =>
    set((s) => ({
      symptoms: [
        { id: crypto.randomUUID(), regionId, severity, note, loggedAt: Date.now() },
        ...s.symptoms,
      ],
    })),
}));

/** Narrow selector factory: components subscribe only to what they render. */
export const selectReading = (layer: LayerId, region: RegionId) => (s: TwinState) =>
  s.readings[`${layer}:${region}`];
