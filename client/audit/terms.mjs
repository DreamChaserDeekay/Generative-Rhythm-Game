// The terms table: where the screens call one thing by several names, and several things by one
// name. The list of concepts below was written by reading every name the inventory found
// (data/inventory.json); the counts are taken from that text.   node audit/terms.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.cwd(), '../docs/audit');
const inventory = JSON.parse(readFileSync(path.join(DIR, 'data/inventory.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');

// every text of every state (not the states at scale, which repeat the same screens)
const texts = [];
for (const s of inventory.states) {
  if (s.error || s.state.includes('@')) continue;
  for (const t of s.texts) texts.push({ state: s.state, kind: t.kind, at: t.at, text: t.text });
}
// the help of the option rows (shown only while a row has the focus)
for (const r of inventory.rows) texts.push({ state: r.state, kind: 'help', at: r.testId, text: r.help });

/** Names a player reads as names: of rows, buttons, headings, hints. */
const NAMES = new Set(['name', 'control', 'heading', 'hint']);
const find = (re, kinds) => texts.filter((t) => (!kinds || kinds.has(t.kind)) && re.test(t.text));
const screens = (list) => [...new Set(list.map((t) => t.state.split('+')[0]))];
const sample = (list, n = 3) => [...new Set(list.map((t) => (t.text.length > 46 ? `${t.text.slice(0, 46)}…` : t.text)))].slice(0, n).join(' / ');

/** One thing under several names: [the thing, [name, pattern, names only?] …]. */
const SYNONYMS = [
  ['이 화면·패널을 떠나기 (Esc · B)', [['닫기', /^(.* )?닫기$/, true], ['완료', /^완료$/, true], ['돌아가기', /^돌아가기$/, true], ['나가기', /나가기$/, true], ['취소', /^취소$/, true], ['선곡으로', /^선곡으로$/, true]]],
  ['처음 값으로 되돌리기', [['기본값', /^기본값$/, true], ['초기화', /^초기화$/, true], ['모두 초기화', /모두 초기화/, true], ['생성 옵션 초기화', /생성 옵션 초기화/, true], ['레인에서 정하기', /레인에서 정하기/, true], ['자동으로', /^자동으로$/, true], ['지우기 (패드 레인)', /^지우기$/, true]]],
  ['Enter · A로 하는 일의 이름 (힌트 바)', [['누르기', /^누르기$/, new Set(['hint'])], ['고르기', /^고르기$/, new Set(['hint'])], ['바꾸기', /^바꾸기$/, new Set(['hint'])], ['지정', /^지정$/, new Set(['hint'])], ['열기', /^열기$/, new Set(['hint'])], ['시작', /^시작$/, new Set(['hint'])]]],
  ['노트가 내려오는 빠르기', [['노트 속도', /노트 속도/], ['SPEED', /SPEED/], ['배속', /배속/], ['빠르기', /빠르기/]]],
  ['노트가 보이는 시간', [['보이는 시간', /보이는 시간/], ['녹색 숫자', /녹색 숫자/]]],
  ['트랙 위쪽 가리개', [['노트 등장 위치', /노트 등장 위치/], ['SUDDEN+', /SUDDEN\+/], ['커버', /커버(를| 사용|가 덮|와| 켜기)/]]],
  ['치는 타이밍의 보정값', [['판정 오프셋', /판정 오프셋/], ['입력 … 지연 보정', /입력·화면 지연|입력 지연/]]],
  ['그리는 타이밍의 보정값', [['표시 오프셋', /표시 오프셋/], ['화면 지연 보정', /화면 지연/]]],
  ['키를 누를 때 나는 소리', [['타격음', /타격음/], ['효과음', /효과음/]]],
  ['곡의 배경 영상', [['배경 영상', /배경 영상/], ['BGA', /BGA/], ['영상 (단독)', /^영상 고르기|유튜브 영상/]]],
  ['노트를 자동으로 치기', [['오토 플레이', /오토 플레이/], ['오토 (단독)', /· 오토$|오토로|오토·/], ['자동으로 칩니다', /자동으로 칩니다/]]],
  ['클릭 트랙 자동 테스트', [['싱크 테스트', /^싱크 테스트$/, true], ['싱크 테스트 · 오토', /^싱크 테스트 · 오토$/, true]]],
  ['곡 정보 패널', [['곡 정보·도구', /곡 정보·도구/, true], ['정보·도구', /^정보·도구$/, true]]],
  ['패드', [['게임패드', /게임패드/], ['패드', /(^|[^임])패드/], ['컨트롤러', /컨트롤러/]]],
  ['노트가 내려오는 줄', [['레인', /레인/], ['건반', /건반/]]],
  ['놓친 노트', [['BREAK', /BREAK/], ['MISS', /MISS/], ['미스', /미스/]]],
  ['입력이 들어오는지 보는 도구', [['동시 입력 테스트', /동시 입력 테스트/, true], ['입력 확인', /^입력 확인/, true]]],
  ['곡 넣기', [['곡 추가', /곡 추가/, true], ['음악 파일 고르기', /음악 파일 고르기/, true], ['음악 파일', /^음악 파일$/, true]]],
];

/** One name for several things: [the name, [the thing, pattern] …]. */
const HOMONYMS = [
  ['배치', [['노트를 레인에 놓는 규칙 (정배치·미러·랜덤)', /^배치$|같은 배치|새 배치|정배치/], ['채보를 만드는 엔진', /패턴 배치|이전 배치|악구 배치/], ['키보드 키의 배열', /BMS 배치|키 배치/], ['패드의 버튼 배열', /표준 배치|비표준 배치/]]],
  ['구간', [['연습할 범위', /연습 구간|^구간$|구간 반복|구간을 골라|구간이 끝나면/], ['곡의 구조 (인트로·후렴)', /구간 편집|구간 추가|구간 고르기|곡의 구간|직접 고침|자동 분석/], ['같은 패턴을 쓰는 반복', /반복 구간/]]],
  ['패턴', [['같은 난이도의 다른 채보 (시드)', /새 패턴|기본 패턴|^패턴$|다른 패턴/], ['노트 모양의 종류 (스트림·트릴)', /패턴 일치|레인 패턴/], ['채보를 만드는 엔진', /패턴 배치|악구·패턴/]]],
  ['판정', [['판정 범위의 모드 (NORMAL·HARD·MAX)', /^판정$|HARD JUDGEMENT|MAX JUDGEMENT/], ['치고 나서 뜨는 글자', /판정·콤보|판정 표시|판정 글자|판정과 콤보/], ['타이밍 보정', /판정 오프셋/], ['판정선', /판정선/]]],
  ['기어', [['트랙을 담는 틀 (꾸미기)', /^기어$|기어를 |기어의 |기어는 |기어에 /], ['플레이 옵션의 탭 "속도·기어"', /속도·기어/]]],
  ['커버', [['트랙을 가리는 가리개', /커버 사용|커버를 씁니다|커버가 덮|속도·커버|커버 켜기/], ['곡의 그림', /커버 이미지|^커버$/]]],
  ['기본', [['선택지의 이름 (기어·노트·사이드 노트·프리셋·글꼴·난이도 기준)', /^기본$/], ['처음 값으로 되돌리는 버튼', /^기본값$/], ['처음의 패턴', /기본 패턴/]]],
  ['자동', [['FEVER가 저절로 켜짐', /^자동$/], ['생성기가 정하는 값', /자동이면|자동으로$/], ['분석이 정한 값', /자동 분석/]]],
  ['키', [['키보드의 키', /키 설정|보조 키|플레이 중 키|아무 키|레인의 키/], ['키 모드 (4K·6K)', /키 모드/], ['노트에 붙는 소리', /키음/], ['누를 때 올라오는 빛', /키 빔/]]],
  ['플레이', [['한 판을 시작', /^플레이$/], ['설정의 탭 "플레이"', /플레이 탭/], ['선곡의 패널 "플레이 옵션"', /플레이 옵션/], ['그 안의 탭 "플레이 규칙"', /플레이 규칙/]]],
  ['오프셋', [['모든 곡의 판정 보정', /판정 오프셋/], ['모든 곡의 표시 보정', /표시 오프셋/], ['이 곡만의 보정', /곡 오프셋/]]],
  ['속도', [['노트가 내려오는 빠르기', /노트 속도/], ['연습의 재생 빠르기', /재생 속도/]]],
  ['밝기', [['플레이 배경', /배경 밝기|배경.*밝기입니다/], ['노트 색', /^밝기$/]]],
  ['효과', [['노트를 칠 때의 그림', /타격 효과/], ['소리', /효과음/]]],
  ['노트', [['설정의 탭 "노트" (모양·색)', /노트 탭|^노트$/], ['채보의 노트 수', /^\d+ 노트$|^노트 \d/]]],
];

const out = ['# 용어 표', '', '화면 문구는 `data/inventory.json`(모든 상태의 글자와 옵션 행의 도움말)에서 가져왔습니다. 어떤 말들이 같은 개념인지는 그 문구를 읽고 정한 것이고(아래 표의 "이름"과 "뜻" 열), 횟수와 화면은 센 것입니다.', ''];
const metrics = {};

out.push('## 같은 개념에 다른 이름', '');
let synonymConflicts = 0;
for (const [concept, variants] of SYNONYMS) {
  const rows = variants
    .map(([name, re, kinds]) => {
      const hits = find(re, kinds === true ? NAMES : kinds || undefined);
      return [name, hits.length, screens(hits).join(', '), sample(hits)];
    })
    .filter((r) => r[1] > 0);
  if (rows.length < 2) continue;
  synonymConflicts++;
  out.push(`### ${concept}: 이름 ${rows.length}가지`, '', table(['이름', '나온 횟수', '화면', '보기'], rows), '');
}
metrics.synonymConflicts = synonymConflicts;

out.push('## 다른 개념에 같은 이름', '');
let homonymConflicts = 0;
for (const [word, senses] of HOMONYMS) {
  const rows = senses
    .map(([sense, re]) => {
      const hits = find(re);
      return [sense, hits.length, screens(hits).join(', '), sample(hits)];
    })
    .filter((r) => r[1] > 0);
  if (rows.length < 2) continue;
  homonymConflicts++;
  out.push(`### "${word}": 뜻 ${rows.length}가지`, '', table(['뜻', '나온 횟수', '화면', '보기'], rows), '');
}
metrics.homonymConflicts = homonymConflicts;
metrics.termConflicts = synonymConflicts + homonymConflicts;

// English left in the names of rows and buttons (a player who does not know the genre's words)
const jargon = [...new Set(find(/[A-Z]{3,}/, NAMES).map((t) => t.text))].filter((t) => !/^(\d+K|[A-Z]\d?$)/.test(t) && !/^(Shift|Enter|Space|Esc|Tab|Home|Ctrl|Alt|PgUp|PgDn|L-Shift|R-Shift)/.test(t));
out.push('## 풀이 없이 쓰는 장르 용어 (이름·버튼·제목에 나온 것)', '', jargon.map((t) => `\`${t}\``).join(' · '), '');
metrics.jargonNames = jargon.length;

writeFileSync(path.join(DIR, '06-terms.md'), out.join('\n'));
const mPath = path.join(DIR, 'data/metrics.json');
let all = {};
try {
  all = JSON.parse(readFileSync(mPath, 'utf8'));
} catch {
  // first run
}
writeFileSync(mPath, `${JSON.stringify({ ...all, 'terms.synonymConflicts': metrics.synonymConflicts, 'terms.homonymConflicts': metrics.homonymConflicts, 'terms.conflicts': metrics.termConflicts }, null, 1)}\n`);
console.log(metrics);
