import { REPAIR_STEPS, nextRepairStatus, repairStep, repairStepIndex } from './repair.model';

describe('repair steps', () => {
  it('there are 3, in order: Received, Fixed, Picked up', () => {
    expect(REPAIR_STEPS.map(s => s.value)).toEqual(['received', 'fixed', 'picked_up']);
    expect(REPAIR_STEPS.map(s => s.label)).toEqual(['Received', 'Fixed', 'Picked up']);
  });

  it('each step has its own colour: received amber, fixed blue, picked up green', () => {
    expect(REPAIR_STEPS.map(s => s.tone)).toEqual(['warning', 'info', 'success']);
  });

  it('repairStep finds a step by its status (an unknown one falls back to Received)', () => {
    expect(repairStep('fixed').label).toBe('Fixed');
    expect(repairStep('nonsense' as never).label).toBe('Received');
  });

  it('repairStepIndex is 0, 1, 2 (and 0 for an unknown status)', () => {
    expect(repairStepIndex('received')).toBe(0);
    expect(repairStepIndex('fixed')).toBe(1);
    expect(repairStepIndex('picked_up')).toBe(2);
    expect(repairStepIndex('nonsense' as never)).toBe(0);
  });

  it('nextRepairStatus moves forward one step and stops after the last', () => {
    expect(nextRepairStatus('received')).toBe('fixed');
    expect(nextRepairStatus('fixed')).toBe('picked_up');
    expect(nextRepairStatus('picked_up')).toBeNull();
  });
});
