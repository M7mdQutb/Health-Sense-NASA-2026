import type { Protocol, RegionId } from '@/types';

export const PROTOCOLS: Partial<Record<RegionId, Protocol>> = {
  'lower-spine': {
    regionId: 'lower-spine',
    title: 'Spinal decompression sequence',
    durationMin: 8,
    steps: [
      'Anchor feet under the restraint bar.',
      'Slow cat-cow, 10 reps, exhale on the flex.',
      'Seated forward fold, hold 45 s.',
      'Log how the lower back feels before and after.',
    ],
  },
  'shoulder-l': {
    regionId: 'shoulder-l',
    title: 'Shoulder mobility reset',
    durationMin: 5,
    steps: ['Arm circles, 10 each direction.', 'Cross-body stretch, 30 s per side.', 'Re-rate severity.'],
  },
};
