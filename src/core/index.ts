// Core API (Part A §A14.2): pure functions, no React, no Firebase.
export * from './types';
export { getCatalog } from './catalog';
export { defaultDesign, isUnlocked, cloneDesign } from './design';
export { DEFAULT_SPLIT, computeBudgets } from './budgets';
export { runChecks, runChecksWith, ROLE_TITLES } from './checks';
export { createSimulation, simulateAll, effectiveDefaultOptionId, type LiveSimulation } from './sim';
export { scoreMission, suggestFixes } from './score';
export { encodeDesign, decodeDesign, encodeChallenge, decodeChallenge } from './share';
export { newSeed, mulberry32 } from './rng';
export * from './format';
export { conceptMaturity, findMissionTwin, estimateScience, tradeSweep, sweepRole } from './explore';
export { requiredGroupStatus } from './checks';
export { previewPatch } from './design';
