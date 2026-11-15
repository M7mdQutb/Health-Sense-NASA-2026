/** Shared contracts. Every later task imports shapes from here and nowhere else. */

export type Status = 'nominal' | 'caution' | 'critical';
export type LayerId = 'skeletal' | 'cardiovascular' | 'nervous';

export type RegionId =
  | 'head' | 'neck' | 'chest' | 'upper-spine' | 'lower-spine'
  | 'shoulder-l' | 'shoulder-r' | 'arm-l' | 'arm-r'
  | 'hip-l' | 'hip-r' | 'femur-l' | 'femur-r' | 'calf-l' | 'calf-r';

export interface BodyRegion {
  id: RegionId;
  label: string;
  /** Layers in which this region is an interactive hotspot. */
  layers: LayerId[];
  /** Hotspot center in model space (meters, y-up, model ~1.8 tall). Tuned in Task 2. */
  anchor: [number, number, number];
  radius: number;
}

export interface RegionReading {
  regionId: RegionId;
  layer: LayerId;
  /** Normalized strain/risk: 0 healthy .. 1 critical. */
  risk: number;
  status: Status;
  headline: string;
  detail: string;
  updatedAt: number; // epoch ms
}

export interface Protocol {
  regionId: RegionId;
  title: string;
  steps: string[];
  durationMin: number;
}

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface SymptomLog {
  id: string;
  regionId: RegionId;
  severity: Severity;
  note?: string;
  loggedAt: number;
}

export type ReadingKey = `${LayerId}:${RegionId}`;
export type ReadingMap = Partial<Record<ReadingKey, RegionReading>>;
