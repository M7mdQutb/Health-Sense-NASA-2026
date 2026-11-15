import type { BodyRegion } from '@/types';

/** Anchors are placeholders until the 3D model loads in Task 2; tune them visually then. */
export const BODY_REGIONS: BodyRegion[] = [
  { id: 'head',        label: 'Head',           layers: ['nervous'],                    anchor: [0, 1.68, 0],      radius: 0.12 },
  { id: 'neck',        label: 'Neck',           layers: ['skeletal', 'cardiovascular'], anchor: [0, 1.52, 0],      radius: 0.07 },
  { id: 'chest',       label: 'Chest',          layers: ['cardiovascular'],             anchor: [0, 1.35, 0.05],   radius: 0.16 },
  { id: 'upper-spine', label: 'Upper spine',    layers: ['skeletal'],                   anchor: [0, 1.25, -0.06],  radius: 0.09 },
  { id: 'lower-spine', label: 'Lower spine',    layers: ['skeletal'],                   anchor: [0, 1.02, -0.06],  radius: 0.1 },
  { id: 'shoulder-l',  label: 'Left shoulder',  layers: ['skeletal'],                   anchor: [-0.22, 1.43, 0],  radius: 0.09 },
  { id: 'shoulder-r',  label: 'Right shoulder', layers: ['skeletal'],                   anchor: [0.22, 1.43, 0],   radius: 0.09 },
  { id: 'arm-l',       label: 'Left arm',       layers: ['cardiovascular'],             anchor: [-0.3, 1.15, 0],   radius: 0.08 },
  { id: 'arm-r',       label: 'Right arm',      layers: ['cardiovascular'],             anchor: [0.3, 1.15, 0],    radius: 0.08 },
  { id: 'hip-l',       label: 'Left hip',       layers: ['skeletal'],                   anchor: [-0.1, 0.92, 0],   radius: 0.09 },
  { id: 'hip-r',       label: 'Right hip',      layers: ['skeletal'],                   anchor: [0.1, 0.92, 0],    radius: 0.09 },
  { id: 'femur-l',     label: 'Left femur',     layers: ['skeletal'],                   anchor: [-0.11, 0.65, 0],  radius: 0.1 },
  { id: 'femur-r',     label: 'Right femur',    layers: ['skeletal'],                   anchor: [0.11, 0.65, 0],   radius: 0.1 },
  { id: 'calf-l',      label: 'Left calf',      layers: ['cardiovascular'],             anchor: [-0.1, 0.25, 0],   radius: 0.09 },
  { id: 'calf-r',      label: 'Right calf',     layers: ['cardiovascular'],             anchor: [0.1, 0.25, 0],    radius: 0.09 },
];

export const LAYERS = [
  { id: 'skeletal',       label: 'Skeletal',       blurb: 'Bone density and spinal load' },
  { id: 'cardiovascular', label: 'Cardiovascular', blurb: 'Fluid shifts and SANS pressure' },
  { id: 'nervous',        label: 'Nervous system', blurb: 'Cognitive load and radiation dose' },
] as const;

export const regionById = (id: string) => BODY_REGIONS.find((r) => r.id === id);
