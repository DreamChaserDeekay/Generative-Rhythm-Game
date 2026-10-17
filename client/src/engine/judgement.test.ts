import { describe, expect, it } from 'vitest';
import { judgementConfig } from './config';
import { JudgementTable } from './judgement';

describe('JudgementTable (DJMAX RESPECT V)', () => {
  const normal = new JudgementTable(judgementConfig, 'NORMAL');

  it('uses ±41.67ms for MAX 100% in NORMAL judgement', () => {
    expect(normal.grade(0)?.percent).toBe(100);
    expect(normal.grade(41.67)?.percent).toBe(100);
    expect(normal.grade(-41.67)?.percent).toBe(100);
    expect(normal.grade(41.68)?.percent).toBe(90);
    expect(normal.grade(-41.68)?.percent).toBe(90);
  });

  it('walks down the percent grades and ends at MAX 1%', () => {
    expect(normal.grade(60)?.percent).toBe(90);
    expect(normal.grade(60.01)?.percent).toBe(80);
    expect(normal.grade(78)?.percent).toBe(80);
    expect(normal.grade(78.01)?.percent).toBe(70);
    expect(normal.grade(160)?.percent).toBe(10);
    expect(normal.grade(160.01)?.percent).toBe(1);
    expect(normal.grade(180)?.percent).toBe(1);
    expect(normal.grade(180.01)).toBeNull();
    expect(normal.outerMs).toBe(180);
    expect(normal.earlyBreakMs).toBe(220);
  });

  it('labels every grade', () => {
    expect(normal.grades.map((g) => g.label)).toEqual([
      'MAX 100%', 'MAX 90%', 'MAX 80%', 'MAX 70%', 'MAX 60%', 'MAX 50%',
      'MAX 40%', 'MAX 30%', 'MAX 20%', 'MAX 10%', 'MAX 1%',
    ]);
  });

  it('halves every window for HARD JUDGEMENT and quarters them for MAX JUDGEMENT', () => {
    const hard = new JudgementTable(judgementConfig, 'HARD');
    expect(hard.grade(20.835)?.percent).toBe(100);
    expect(hard.grade(20.84)?.percent).toBe(90);
    expect(hard.outerMs).toBe(90);
    expect(hard.earlyBreakMs).toBe(110);

    const max = new JudgementTable(judgementConfig, 'MAX');
    expect(max.grade(10.4175)?.percent).toBe(100);
    expect(max.grade(10.42)?.percent).toBe(90);
    expect(max.outerMs).toBe(45);
    expect(max.grade(45.01)).toBeNull();
  });
});
