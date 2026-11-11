/** The settings' help texts that go through every gear in turn, and how they are cut to the picked one. */

/** 설정 → 기어 → 기어. */
export const GEAR_HELP =
  '트랙을 담는 기어입니다. 판정선 아래 받침의 꾸밈, 트랙 양옆 테두리, 게이지·점수판의 모양과 숫자 글꼴이 함께 바뀝니다. 기본은 그래파이트에 레인마다 낮은 키캡(누르면 하늘색 불)과 점수·속도·정확도 창, 앞쪽의 하늘색 불빛 띠, 크리스털은 레인마다 젖빛 크리스털 키캡(누르면 얼음빛), 넓은 면으로 깎은 옅은 빛깔의 받침에 박힌 사파이어빛 육각 판의 점수·속도·정확도, 레인을 따라 맑은 유리 테두리, 하늘은 레인마다 가는 표시선(누르면 청록빛 불), 구름 낀 하늘 받침에 깃털 아래 쓴 점수와 비치는 알약 창의 속도·정확도, 눈금이 난 하늘빛 유리 테두리, 레인에 아주 옅게 깔린 같은 하늘, 오락실 기체는 검은 플라스틱·크롬에 조이스틱·아크릴 버튼·동전 투입구, 빈티지 리시버는 월넛과 은색 앞판에 튜닝 다이얼·노브·스위치·미터, 나전칠기는 흑칠에 자개 학 뚜껑·자개 덩굴·황동 자물쇠 판, 커스텀 키보드는 차콜 알루미늄에 노브·OLED 창·황동 명판·방향키, 레이싱 휠은 카본에 시프트 라이트·로터리·고무 버튼·랩 타이머, 우주선 계기판은 회색 패널에 보호 덮개 셀렉터·토글·경고등·주의 띠와 금박 단열재 테두리, 피아노는 흑단 래커에 레인마다 상아색 흰 건반과 그 사이 검은 건반, 스크래치 아래 높은음자리표 황동 메달, 달은 깨뜨린 은빛 크리스털 유리 덩어리 한 장(곧은 결정 면 사이로 유리 속의 결이 비침)과 같은 유리의 테두리입니다. 누른 레인은 키빔과 타격 효과로 보입니다. 받침의 버튼·노브·창 같은 부품에는 박자에 맞춰 불이 들어오고, 마디마다 테두리를 따라 빛이 지나가며, 피버 때는 테두리의 불빛이 다 켜집니다. 판정선은 어느 기어에서나 같은 자리의 굵은 선(기본·크리스털·하늘 기어는 흰 심에 저마다의 푸른 선, 나머지는 붉은 선)으로 레이저처럼 조금씩 일렁이고, 받침은 그보다 조금 아래에서 시작합니다.';

/** 설정 → 기어 → 판정·콤보 글꼴. */
export const HUD_TYPE_HELP =
  '판정과 콤보를 쓰는 글꼴과 색입니다. 기어를 따르면 기본은 흰 장체(MAX는 흰색, 퍼센트는 하늘색), 크리스털은 비스듬한 면으로 깎은 기울어진 글자(MAX는 흰 면, 퍼센트는 얼음빛에서 낮을수록 강철빛·연보라, 놓치면 금 간 루비색), 하늘은 둥글고 기울어진 굵은 글자(흰색에서 발끝으로 하늘색, MAX는 흰색, 퍼센트는 청록에서 낮을수록 하늘색·연보라, 놓치면 산호색), 오락실 기체는 빨간 7세그 콤보와 굵은 이탤릭 판정, 빈티지 리시버는 호박색 7세그 콤보와 가는 장체 판정, 나전칠기는 금색 세리프, 커스텀 키보드는 픽셀 글꼴과 주황 밑줄, 레이싱 휠은 기울어진 흰 숫자와 빨간 밑줄, 우주선 계기판은 스텐실 판정과 초록 7세그 콤보, 피아노는 악보의 셈여림 글씨 같은 굵은 이탤릭 세리프, 달은 넓은 기하 글꼴(MAX는 흰색, 퍼센트는 은색)로 씁니다. 기본은 기어와 상관없이 흰 장체에 MAX를 하늘색으로 씁니다.';

/** A help text cut to one value: what stands before its list of values, the value's own words, what follows the list. */
export interface PickedHelp {
  intro: string;
  clause: string;
  outro: string;
}

/**
 * A help text that goes through every value in turn ("기본은 …, 오락실 기체는 …, 달은 …입니다.")
 * cut to the value picked. The words are the text's own; only the other values' are left out.
 * `labels` are the values' names and `current` the picked one's. Null where the text has no such
 * list (fewer than three of the names followed by 은 or 는) or does not name the picked value: the
 * text is then shown whole.
 */
export function pickedHelp(text: string, labels: readonly string[], current: string): PickedHelp | null {
  const marks = labels
    .map((label) => {
      const [a, b] = [text.indexOf(`${label}은 `), text.indexOf(`${label}는 `)];
      return { label, at: a < 0 ? b : b < 0 ? a : Math.min(a, b) };
    })
    .filter((m) => m.at >= 0)
    .sort((x, y) => x.at - y.at);
  const picked = marks.findIndex((m) => m.label === current);
  if (marks.length < 3 || picked < 0) return null;
  // the list ends with the sentence its last value is in
  const stop = text.indexOf('. ', marks[marks.length - 1].at);
  const end = stop < 0 ? text.length : stop + 1;
  const clause = text
    .slice(marks[picked].at + current.length + 2, picked + 1 < marks.length ? marks[picked + 1].at : end)
    .trim()
    .replace(/,$/, '')
    // the last value's words close the sentence
    .replace(/(입니다|로 씁니다)\.$/, '')
    .trim();
  return { intro: text.slice(0, marks[0].at).trim(), clause, outro: text.slice(end).trim() };
}
