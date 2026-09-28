import { db, uid, today } from '../db';
import type { Part, PartCategory, Step, Ladder, WorkType } from '../types';
import { STEP_NAMES } from '../types';

// What each step means, by part category. Same five buttons, different words.
const INSTALL_MEANING: Record<PartCategory, string[]> = {
  fixture:   ['Nothing done', 'Core drilled or trenched', 'Base in, backfilled', 'Cable landed, transformer on', 'Fixture on, aimed, tested'],
  sign:      ['Nothing done', 'Footing excavated', 'Base set, backfilled', 'Cable landed, transformer on', 'Sign on, legend checked, tested'],
  can:       ['Nothing done', 'Excavated', 'Can set, plumb, backfilled', 'Transformer in, secondary landed', 'Lid on, tested'],
  conduit:   ['Nothing done', 'Trenched or bored', 'Conduit in', 'Cable pulled', 'Terminated, tested'],
  duct:      ['Nothing done', 'Trenched', 'Duct in, concrete poured', 'Cable pulled', 'Terminated, tested'],
  cable:     ['Nothing done', 'Path ready', 'Pulled', 'Terminated', 'Megger passed, tested'],
  handhole:  ['Nothing done', 'Excavated', 'Structure set', 'Cable landed', 'Lid on, tested'],
  manhole:   ['Nothing done', 'Excavated', 'Structure set', 'Cable landed, racks in', 'Lid on, tested'],
  regulator: ['Nothing done', 'Pad ready', 'Set on pad', 'Feeders and loops landed', 'Energized, tested'],
  equipment: ['Nothing done', 'Location ready', 'Mounted', 'Wired', 'Energized, tested'],
  pole:      ['Nothing done', 'Footing excavated', 'Pole set', 'Fixtures and wiring on', 'Energized, aimed, tested'],
};

const DEMO_MEANING = ['Still in service', 'Disconnected, locked out', 'Saw cut or excavated', 'Out of the ground', 'Hauled off, backfilled'];

export function stepMeaning(part: Part, ladder: Ladder, step: Step): string {
  if (ladder === 'demo') return DEMO_MEANING[step];
  return INSTALL_MEANING[part.category][step];
}

export function stepName(step: Step): string {
  return STEP_NAMES[step];
}

// Which ladder is the foreman working on right now for this part.
// RE parts run demo first, then install.
export function activeLadder(part: Part): Ladder {
  if (part.work === 'demo') return 'demo';
  if (part.work === 're' && part.demoStep < 4) return 'demo';
  return 'install';
}

export function currentStep(part: Part, ladder: Ladder = activeLadder(part)): Step {
  return ladder === 'demo' ? part.demoStep : part.installStep;
}

export function hasLadder(part: Part, ladder: Ladder): boolean {
  if (ladder === 'demo') return part.work === 'demo' || part.work === 're';
  return part.work === 'install' || part.work === 're';
}

export function workLabel(work: WorkType): string {
  return work === 're' ? 'Remove and reinstall' : work === 'demo' ? 'Demo' : 'Install';
}

// Percent complete for a zone: average of every ladder every part carries.
export function zoneProgress(parts: Part[]): number {
  let total = 0, done = 0;
  for (const p of parts) {
    if (hasLadder(p, 'demo')) { total += 4; done += p.demoStep; }
    if (hasLadder(p, 'install')) { total += 4; done += p.installStep; }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export interface SetStepInput {
  part: Part;
  ladder: Ladder;
  toStep: Step;
  foreman: string;
  qtyDone?: number;
  note?: string;
  reportDate?: string;
}

// The one write path for status. Appends an event, then updates the part.
// Events are never edited. That log is the billing backup.
export async function setStep(input: SetStepInput): Promise<void> {
  const { part, ladder, toStep, foreman, qtyDone, note } = input;
  const reportDate = input.reportDate ?? today();
  const fromStep = currentStep(part, ladder);
  if (fromStep === toStep && qtyDone === undefined && !note) return;

  await db.transaction('rw', db.events, db.parts, async () => {
    await db.events.add({
      id: uid('ev'),
      jobId: part.jobId,
      partId: part.id,
      ladder,
      reportDate,
      foreman,
      fromStep,
      toStep,
      qtyDone,
      note,
      createdAt: Date.now(),
    });
    const patch: Partial<Part> = ladder === 'demo' ? { demoStep: toStep } : { installStep: toStep };
    if (qtyDone !== undefined) patch.qtyDone = qtyDone;
    await db.parts.update(part.id, patch);
  });
}
