import { describe, expect, it } from 'vitest';
import { GEAR_STYLES } from '../render/deckArt';
import { DECK_NAMES } from './optionRows';
import { GEAR_HELP, HUD_TYPE_HELP, pickedHelp } from './settingsHelp';

const GEARS = GEAR_STYLES.map((id) => DECK_NAMES[id]);

describe('pickedHelp', () => {
  it('cuts the gear help to the picked gear: what stands before the list, its own words, what follows', () => {
    expect(pickedHelp(GEAR_HELP, GEARS, '기본')).toEqual({
      intro: '트랙을 담는 기어입니다. 판정선 아래 받침의 꾸밈, 트랙 양옆 테두리, 게이지·점수판의 모양과 숫자 글꼴이 함께 바뀝니다.',
      clause: '그래파이트에 레인마다 낮은 키캡(누르면 하늘색 불)과 점수·속도·정확도 창, 앞쪽의 하늘색 불빛 띠',
      outro:
        '누른 레인은 키빔과 타격 효과로 보입니다. 받침의 버튼·노브·창 같은 부품에는 박자에 맞춰 불이 들어오고, 마디마다 테두리를 따라 빛이 지나가며, 피버 때는 테두리의 불빛이 다 켜집니다. 판정선은 어느 기어에서나 같은 자리의 굵은 선(기본·크리스털·하늘 기어는 흰 심에 저마다의 푸른 선, 나머지는 붉은 선)으로 레이저처럼 조금씩 일렁이고, 받침은 그보다 조금 아래에서 시작합니다.',
    });
    // the crystal skin's gear (saved as 'prism'), with commas of its own
    expect(pickedHelp(GEAR_HELP, GEARS, '크리스털')?.clause).toBe('레인마다 젖빛 크리스털 키캡(누르면 얼음빛), 넓은 면으로 깎은 옅은 빛깔의 받침에 박힌 사파이어빛 육각 판의 점수·속도·정확도, 레인을 따라 맑은 유리 테두리');
    // the sky skin's gear, whose name is the start of a colour's (하늘색) in other gears' words
    expect(pickedHelp(GEAR_HELP, GEARS, '하늘')?.clause).toBe('레인마다 가는 표시선(누르면 청록빛 불), 구름 낀 하늘 받침에 깃털 아래 쓴 점수와 비치는 알약 창의 속도·정확도, 옅은 하늘빛 유리 테두리, 레인에 아주 옅게 깔린 같은 하늘과 양 가장자리의 눈금');
    // a gear in the middle of the list, with commas of its own
    expect(pickedHelp(GEAR_HELP, GEARS, '피아노')?.clause).toBe('흑단 래커에 레인마다 상아색 흰 건반과 그 사이 검은 건반, 스크래치 아래 높은음자리표 황동 메달');
    // the last gear's words close the sentence: without its ending
    expect(pickedHelp(GEAR_HELP, GEARS, '달')?.clause).toBe('깨뜨린 은빛 크리스털 유리 덩어리 한 장(곧은 결정 면 사이로 유리 속의 결이 비침)과 같은 유리의 테두리');
  });

  it('cuts the judgement and combo type help the same way', () => {
    expect(pickedHelp(HUD_TYPE_HELP, GEARS, '오락실 기체')).toEqual({
      intro: '판정과 콤보를 쓰는 글꼴과 색입니다. 기어를 따르면',
      clause: '빨간 7세그 콤보와 굵은 이탤릭 판정',
      outro: '기본은 기어와 상관없이 흰 장체에 MAX를 하늘색으로 씁니다.',
    });
    // the first 기본 is the gear's (in the list), the one after the list the row's own value
    expect(pickedHelp(HUD_TYPE_HELP, GEARS, '기본')?.clause).toBe('흰 장체(MAX는 흰색, 퍼센트는 하늘색)');
    expect(pickedHelp(HUD_TYPE_HELP, GEARS, '달')?.clause).toBe('넓은 기하 글꼴(MAX는 흰색, 퍼센트는 은색)');
    expect(pickedHelp(HUD_TYPE_HELP, GEARS, '하늘')?.clause).toBe('둥글고 기울어진 굵은 글자(흰색에서 발끝으로 하늘색, MAX는 흰색, 퍼센트는 청록에서 낮을수록 하늘색·연보라, 놓치면 산호색)');
    expect(pickedHelp(HUD_TYPE_HELP, GEARS, '크리스털')?.clause).toBe('비스듬한 면으로 깎은 기울어진 글자(MAX는 흰 면, 퍼센트는 얼음빛에서 낮을수록 강철빛·연보라, 놓치면 금 간 루비색)');
  });

  it('keeps every word of the list: each gear has its clause, and together they are the list', () => {
    for (const text of [GEAR_HELP, HUD_TYPE_HELP]) {
      const cuts = GEARS.map((gear) => {
        const cut = pickedHelp(text, GEARS, gear);
        expect(cut, gear).not.toBeNull();
        return cut!;
      });
      const [first] = cuts;
      for (const cut of cuts) {
        expect(cut.intro).toBe(first.intro);
        expect(cut.outro).toBe(first.outro);
        expect(cut.clause).not.toBe('');
      }
      // the text again, from its parts: the gears' names before their words, the last one's ending put back
      const list = GEARS.map((gear, i) => `${gear}${text.includes(`${gear}은 `) ? '은' : '는'} ${cuts[i].clause}`).join(', ');
      const ending = text === GEAR_HELP ? '입니다.' : '로 씁니다.';
      expect(`${first.intro} ${list}${ending} ${first.outro}`).toBe(text);
    }
  });

  it('leaves a text without such a list whole, and one that does not name the picked value', () => {
    expect(pickedHelp('트랙의 폭입니다.', GEARS, '기본')).toBeNull();
    // two names are no list
    expect(pickedHelp('기본은 비치는 막대로, 달은 점으로 그립니다.', GEARS, '기본')).toBeNull();
    expect(pickedHelp(GEAR_HELP, GEARS, '없는 기어')).toBeNull();
    expect(pickedHelp(GEAR_HELP, GEARS.slice(0, 5), '달')).toBeNull();
  });
});
