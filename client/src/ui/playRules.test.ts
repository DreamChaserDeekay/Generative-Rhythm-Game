import { describe, expect, it } from 'vitest';
import type { ReplayData } from '../engine/replay';
import type { SessionResult } from '../engine/session';
import type { Chart } from '../engine/types';
import { DEFAULT_SETTINGS } from '../settings/settings';
import type { PlayRequest } from './App';
import { bestAfterPlay, pacemakerChoices, pacemakerLabel, paceRatio, playedSettings, playModeLabel, ruleChips } from './playRules';

const chart = { meta: { chartId: 'c1', songId: 's1' } } as Chart;
const request = (o: Partial<PlayRequest> = {}): PlayRequest => ({ chart, loadAudio: async () => null, autoPlay: false, ...o });
const replay = { settings: { judgementMode: 'MAX', ruleset: 'EXSCORE', gaugeType: 'HARD', fever: 'OFF', placement: 'MIRROR', placementSeed: 1, hiSpeed: 3 } } as ReplayData;
const result = (score: number) => ({ score, rate: score / 10_000 }) as SessionResult;

describe('the rules a play runs on', () => {
  it('names only the rules that are not the defaults', () => {
    expect(ruleChips(DEFAULT_SETTINGS, false)).toEqual([]);
    expect(ruleChips({ ...DEFAULT_SETTINGS, judgementMode: 'HARD', placement: 'RANDOM', ruleset: 'EXSCORE', gaugeType: 'HAZARD' }, false)).toEqual([
      ['', 'HARD JUDGEMENT'],
      ['배치', '랜덤'],
      ['점수 규칙', 'EX-SCORE'],
      ['게이지', 'HAZARD'],
    ]);
    // practice always runs on the NORMAL gauge
    expect(ruleChips({ ...DEFAULT_SETTINGS, gaugeType: 'HARD' }, true)).toEqual([]);
  });

  it("runs a replay on its recorded judgement settings, and names how a play runs", () => {
    const s = playedSettings(request({ replay }), { ...DEFAULT_SETTINGS, hiSpeed: 5 });
    expect(s).toMatchObject({ judgementMode: 'MAX', ruleset: 'EXSCORE', gaugeType: 'HARD', placement: 'MIRROR', hiSpeed: 5 });
    expect(playedSettings(request(), DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS);
    expect(playModeLabel(request({ replay }))).toBe('REPLAY');
    expect(playModeLabel(request({ autoPlay: true }))).toBe('AUTO');
    expect(playModeLabel(request({ practice: { startMs: 0, endMs: 1, rate: 0.75, loop: false } }))).toBe('연습 · 재생 속도 ×0.75');
    expect(playModeLabel(request({ practice: { startMs: 0, endMs: 1, rate: 1, loop: false } }))).toBe('연습');
    expect(playModeLabel(request())).toBeNull();
  });

  it('tests a chart from the editor as it is written: no placement, the default gauge and FEVER, named 에디터 테스트', () => {
    const own = { ...DEFAULT_SETTINGS, placement: 'R-RANDOM' as const, gaugeType: 'HARD' as const, fever: 'MANUAL' as const, judgementMode: 'HARD' as const, hiSpeed: 5 };
    const editor = request({ fromEditor: true, practice: { startMs: 0, endMs: 1, rate: 1, loop: false } });
    expect(playedSettings(editor, own)).toEqual({ ...own, placement: 'OFF', gaugeType: DEFAULT_SETTINGS.gaugeType, fever: DEFAULT_SETTINGS.fever });
    // the judgement mode stays the player's, and is the one rule named
    expect(ruleChips(playedSettings(editor, own), true)).toEqual([['', 'HARD JUDGEMENT']]);
    expect(playModeLabel(editor)).toBe('에디터 테스트');
  });

  it('offers grades as pacemaker targets under EX-SCORE and shares of the score otherwise', () => {
    expect(pacemakerChoices('EXSCORE', 'OFF')).toEqual(['OFF', 'BEST', 'A', 'AA', 'AAA', 'MAX']);
    expect(pacemakerChoices('RESPECT', 'BEST')).toEqual(['OFF', 'BEST', '90', '95', '98', '99', '100']);
    // a target of the other kind stays listed, so the row shows what is set
    expect(pacemakerChoices('GRADE', 'AAA')).toEqual(['OFF', 'BEST', '90', '95', '98', '99', '100', 'AAA']);
    expect([paceRatio('95'), paceRatio('AAA'), paceRatio('A'), paceRatio('MAX'), paceRatio('BEST'), paceRatio('OFF')]).toEqual([0.95, 0.8889, 0.6667, 1, null, null]);
    expect([pacemakerLabel('BEST'), pacemakerLabel('98'), pacemakerLabel('AA')]).toEqual(['vs BEST', 'vs 98%', 'vs AA']);
  });

  it('paces a retry from the result against the play just made when it beat the best', () => {
    const own = { score: 1, rate: 1, log: [] } as unknown as ReplayData;
    const best = { score: 900_000, rate: 90, scoreId: 7, hasReplay: true };
    expect(bestAfterPlay(request({ best }), { result: result(950_000), replay: own })).toEqual({ score: 950_000, rate: 95, replay: own });
    expect(bestAfterPlay(request({ best: null }), { result: result(500_000), replay: own })).toEqual({ score: 500_000, rate: 50, replay: own });
    expect(bestAfterPlay(request({ best }), { result: result(800_000), replay: own })).toBe(best);
    // autoplay, practice, a replay and a play with no song keep the record they started with
    expect(bestAfterPlay(request({ best, autoPlay: true }), { result: result(990_000), replay: null })).toBe(best);
    expect(bestAfterPlay(request({ best, practice: { startMs: 0, endMs: 1, rate: 1, loop: false } }), { result: result(990_000), replay: own })).toBe(best);
    expect(bestAfterPlay(request({ best, chart: { meta: { chartId: 'sync' } } as Chart }), { result: result(990_000), replay: own })).toBe(best);
  });
});
