// The six mission steps shown in the top bar (NASA life-cycle words), shared by the top bar and the step transition.
import { create } from 'zustand';
import type { Phase } from '../core';

export const STEPS: { label: string; phases: Phase[]; cml?: string }[] = [
  { label: 'Need & Goals', phases: ['lobby'], cml: 'CML 1' },
  { label: 'Concept', phases: ['council'] },
  { label: 'Requirements & Design', phases: ['design'], cml: 'CML 2–3' },
  { label: 'Build & Verify', phases: ['launch'], cml: 'CML 4' },
  { label: 'Implement', phases: ['ops'] },
  { label: 'Results', phases: ['report'] },
];
export const PHASES: Phase[] = ['lobby', 'council', 'design', 'launch', 'ops', 'report'];

/** The step a phase belongs to; the briefing before the council still counts as "Need & Goals". */
export function stepOf(phase: Phase, briefingDone: boolean): number {
  return phase === 'council' && !briefingDone ? 0 : PHASES.indexOf(phase);
}

/** While a step transition plays, the step its card is showing: the top bar follows the card instead of jumping
 *  ahead when several steps pass at once. null when no transition is running. */
export const useShownStep = create<{ step: number | null }>(() => ({ step: null }));
