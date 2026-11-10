// Turns the audit's data (docs/audit/data/*.json, written by the *.audit.ts tools) into the tables
// of docs/audit/*.md and the numbers of docs/audit/data/metrics.json.   node audit/report.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.cwd(), '../docs/audit');
const DATA = path.join(DIR, 'data');
const read = (name) => (existsSync(path.join(DATA, name)) ? JSON.parse(readFileSync(path.join(DATA, name), 'utf8')) : null);
const write = (name, text) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, name), text);
};
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
const uniq = (list) => [...new Set(list)];

const graphs = { kb: read('graph.kb.json'), pad: read('graph.pad.json') };
const inventory = read('inventory.json');
const layout = read('layout.json');
const tasks = read('tasks.json');
const metrics = {};

// ---------------------------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------------------------

/** A hint's key as the bar writes it → the input the crawl pressed. */
function hintInputs(keys, device) {
  if (device === 'pad') {
    const names = { '↑': 'Up', '↓': 'Down', '←': 'Left', '→': 'Right' };
    return keys.map((k) => `Pad:${names[k] ?? k}`);
  }
  const one = (k) => {
    const names = { '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight', PgUp: 'PageUp', PgDn: 'PageDown', Esc: 'Escape', Shift: 'ShiftLeft', '+': 'Shift+Equal', '/': 'Slash', '-': 'Minus' };
    if (names[k]) return names[k];
    if (/^[A-Z]$/.test(k)) return `Key${k}`;
    if (k.includes('+')) return k.split('+').map((p, i, all) => (i === all.length - 1 ? one(p) : p === 'Ctrl' ? 'Control' : p)).join('+');
    return k;
  };
  // "Shift ← →": Shift with each of the others
  if (keys.length > 1 && keys[0] === 'Shift') return keys.slice(1).map((k) => `Shift+${one(k)}`);
  return keys.map(one);
}

const keyName = (input) =>
  input
    .replace(/^Pad:/, '패드 ')
    .replace(/^click:/, '클릭 ')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Escape', 'Esc')
    .replace('ShiftLeft', 'Shift(단독)')
    .replace('Shift+Equal', '+')
    .replace('Control+', 'Ctrl+')
    .replace(/Key([A-Z])/, '$1')
    .replace('PageUp', 'PgUp')
    .replace('PageDown', 'PgDn');

/** What an input did, in a few words. */
function effect(p) {
  if (p.to !== p.state) return `→ ${p.to}`;
  const parts = [];
  if (p.settings.length > 0) parts.push(`설정 ${p.settings.join(', ')}`);
  else if (p.changed) parts.push('화면 바뀜');
  if (p.focusAfter !== p.focus) parts.push(`포커스 → ${p.focusAfter}`);
  return parts.join(' · ') || '';
}
const acts = (p) => p.to !== p.state || p.settings.length > 0 || p.changed || p.focusAfter !== p.focus;

// ---------------------------------------------------------------------------------------------
// the graph
// ---------------------------------------------------------------------------------------------

function graphReport() {
  const out = ['# 화면 전환 그래프와 그 검사', '', '`client/audit/graph.audit.ts`가 게임을 직접 눌러 가며 만든 것입니다 (키보드만으로 한 번, 패드만으로 한 번). 원본: `data/graph.kb.json`, `data/graph.pad.json`.', ''];
  for (const device of ['kb', 'pad']) {
    const g = graphs[device];
    if (!g) continue;
    const name = device === 'kb' ? '키보드' : '패드';
    const states = g.states;
    const bySig = new Map(states.map((s) => [s.sig, s]));
    const probes = g.probes;
    out.push(`## ${name}`, '');

    // states and how they were reached
    const pointerOnly = states.filter((s) => s.path.some((p) => p.startsWith('click:')));
    out.push(`상태 ${states.length}개, 입력 ${probes.length}번. 이 가운데 ${name}만으로는 가지 못하고 포인터로만 간 상태: ${pointerOnly.length}개.`, '');
    out.push(table(['상태', '가는 길 (처음 찾은 길)', '첫 포커스', '항목 수', '포커스가 닿은 항목', '비고'], states.map((s) => [s.sig, s.path.filter((p) => !p.startsWith('focus=')).map(keyName).join(' ') || '(시작)', s.focus, s.controls.length, Object.keys(s.stops).filter((k) => k !== '(none)').length, s.skipped ?? (s.path.some((p) => p.startsWith('click:')) ? '포인터로만' : '')])), '');

    // the edges, merged by pair of states
    const edges = new Map();
    for (const p of probes) {
      if (p.to === p.state || p.to === 'unknown') continue;
      const key = `${p.state}\u0000${p.to}`;
      const at = p.level === 1 ? '' : `@${p.focus}`;
      edges.set(key, uniq([...(edges.get(key) ?? []), `${keyName(p.input)}${at ? ` (${at.slice(1)})` : ''}`]));
    }
    const id = (sig) => `n${[...bySig.keys()].indexOf(sig)}`;
    out.push('```mermaid', 'flowchart LR');
    for (const s of states) out.push(`  ${id(s.sig)}["${s.sig}"]`);
    for (const [key, keys] of edges) {
      const [from, to] = key.split('\u0000');
      if (!bySig.has(to)) continue;
      const label = keys.slice(0, 3).join(', ') + (keys.length > 3 ? ` 외 ${keys.length - 3}` : '');
      out.push(`  ${id(from)} -->|"${label.replace(/"/g, "'")}"| ${id(to)}`);
    }
    out.push('```', '');

    // dead ends: a state no input of the device leaves
    const walked = states.filter((s) => !s.skipped);
    const dead = walked.filter((s) => !probes.some((p) => p.state === s.sig && p.to !== s.sig && !p.input.startsWith('click:')));
    metrics[`${device}.states`] = states.length;
    metrics[`${device}.pointerOnlyStates`] = pointerOnly.length;
    metrics[`${device}.deadEnds`] = dead.length;
    out.push(`### 막다른 곳`, '', dead.length === 0 ? `없음: 걸어 본 상태 ${walked.length}개 모두 ${name} 입력으로 나갈 수 있습니다.` : table(['상태'], dead.map((s) => [s.sig])), '');

    // controls no key or focus reaches
    const rows = [];
    let total = 0;
    let unreached = 0;
    for (const s of walked) {
      const clicks = probes.filter((p) => p.state === s.sig && p.level === 3);
      const keyed = probes.filter((p) => p.state === s.sig && p.level < 3 && acts(p));
      for (const c of s.controls) {
        if (c.region === 'hintbar') continue;
        total++;
        if (c.key in s.stops) continue;
        const click = clicks.find((p) => p.input === `click:${c.key}`);
        const same = click ? keyed.filter((p) => p.outcome === click.outcome).map((p) => keyName(p.input)) : [];
        if (same.length > 0) continue;
        unreached++;
        rows.push([s.sig, c.label || c.key, c.key, click ? effect(click) || '(눌러도 변화 없음)' : '(누르지 않음: 라이브러리를 바꾸거나 파일을 받음)']);
      }
    }
    metrics[`${device}.controls`] = total;
    metrics[`${device}.controlsUnreached`] = unreached;
    out.push(`### ${name}로 닿지 않는 항목`, '', `걸어 본 상태의 항목 ${total}개 가운데 포커스가 닿지도 않고 같은 일을 하는 키도 없는 것: **${unreached}개**. (포인터로 누른 결과와 같은 결과를 내는 키가 그 상태에 있으면 닿는 것으로 셉니다.)`, '', rows.length ? table(['상태', '항목', '키', '포인터로 누르면'], rows) : '', '');

    // back: does it return to the state and the control it left
    // (only inputs that open something over where the player was: a panel, a menu, another screen.
    //  closing a panel or changing a tab is not a place to come back from)
    const screenOf = (sig) => sig.split('+')[0].split(':')[0];
    const opens = (p) => p.to.startsWith(`${p.state}+`) || (screenOf(p.to) !== screenOf(p.state) && !['result', 'play'].includes(screenOf(p.state)) && !(screenOf(p.state) !== 'select' && screenOf(p.to) === 'select'));
    const back = probes.filter((p) => p.backTo !== undefined && opens(p));
    const wrongState = back.filter((p) => p.backTo !== p.state);
    const wrongFocus = back.filter((p) => p.backTo === p.state && p.backFocus !== p.focus && p.focus !== '(none)');
    metrics[`${device}.backChecked`] = back.length;
    metrics[`${device}.backWrongState`] = wrongState.length;
    metrics[`${device}.backWrongFocus`] = wrongFocus.length;
    out.push(`### 뒤로 가기 (${device === 'kb' ? 'Esc' : 'B'})`, '', `다른 상태로 간 입력 ${back.length}번에 대해 곧바로 뒤로 가기를 눌렀습니다. 원래 상태로 돌아오지 않음: **${wrongState.length}번**, 상태는 돌아왔지만 포커스가 다른 곳: **${wrongFocus.length}번**.`, '');
    if (wrongState.length) out.push(table(['떠난 상태', '입력', '간 곳', '뒤로 가면'], wrongState.map((p) => [p.state, `${keyName(p.input)}${p.level > 1 ? ` (${p.focus})` : ''}`, p.to, p.backTo])), '');
    if (wrongFocus.length) out.push(table(['상태', '입력', '간 곳', '떠날 때 포커스', '돌아온 포커스'], wrongFocus.map((p) => [p.state, keyName(p.input), p.to, p.focus, p.backFocus])), '');
  }

  // states one device reaches and the other does not
  if (graphs.kb && graphs.pad) {
    const reach = (g) => new Set(g.states.filter((s) => !s.path.some((p) => p.startsWith('click:'))).map((s) => s.sig));
    const kb = reach(graphs.kb);
    const pad = reach(graphs.pad);
    const kbOnly = [...kb].filter((s) => !pad.has(s));
    const padOnly = [...pad].filter((s) => !kb.has(s));
    metrics['pad.statesMissing'] = kbOnly.length;
    out.push('## 키보드로는 가는데 패드로는 가지 못하는 상태', '', kbOnly.length ? table(['상태', '키보드의 길'], kbOnly.map((s) => [s, graphs.kb.states.find((x) => x.sig === s).path.filter((p) => !p.startsWith('focus=')).map(keyName).join(' ')])) : '없음', '');
    if (padOnly.length) out.push('## 패드로만 가는 상태', '', table(['상태'], padOnly.map((s) => [s])), '');
  }
  write('02-graph.md', out.join('\n'));
}

// ---------------------------------------------------------------------------------------------
// keys: what each does where, what the hints say, what is hidden
// ---------------------------------------------------------------------------------------------

function keysReport() {
  const out = ['# 키와 버튼: 화면마다 하는 일', '', '전환 그래프의 1단계 입력(각 상태의 첫 포커스에서 누른 모든 키)에서 뽑았습니다. 빈칸은 아무 일도 없었다는 뜻입니다.', ''];
  for (const device of ['kb', 'pad']) {
    const g = graphs[device];
    if (!g) continue;
    const name = device === 'kb' ? '키보드' : '패드';
    const states = g.states.filter((s) => !s.skipped);
    const l1 = g.probes.filter((p) => p.level === 1);
    const inputs = uniq(l1.map((p) => p.input));
    out.push(`## ${name}`, '');

    // the matrix, a table per input (wide tables do not read)
    out.push('### 입력마다', '');
    const meanings = new Map();
    for (const input of inputs) {
      const rows = [];
      for (const s of states) {
        const p = l1.find((x) => x.state === s.sig && x.input === input);
        if (!p) continue;
        const hint = s.hints.find((h) => hintInputs(h.keys, device).includes(input));
        const cap = device === 'kb' ? s.caps.find((c) => hintInputs([c.key], 'kb').includes(input)) : null;
        const did = effect(p);
        if (!did && !hint && !cap) continue;
        rows.push([s.sig, did, hint ? hint.label : '', cap ? cap.on : '', p.prevented === null ? '' : p.prevented ? '' : '브라우저 기본 동작 남음']);
        if (did || hint) meanings.set(input, [...(meanings.get(input) ?? []), { state: s.sig, did, hint: hint?.label ?? '', to: p.to !== p.state ? p.to : '' }]);
      }
      if (rows.length === 0) continue;
      out.push(`#### ${keyName(input)}`, '', table(['상태', '한 일', '힌트 바의 말', '화면의 키 표시', ''], rows), '');
    }

    // hints that name a key which did nothing from the first focus
    const dead = [];
    const hidden = [];
    for (const s of states) {
      for (const h of s.hints) {
        for (const input of hintInputs(h.keys, device)) {
          const tried = g.probes.filter((x) => x.state === s.sig && x.input === input && x.level < 3);
          // (the focus moving is the key working too)
          if (tried.length > 0 && !tried.some((x) => acts(x) || x.focusAfter !== x.focus)) dead.push([s.sig, keyName(input), h.label, s.focus]);
        }
      }
      const named = new Set([...s.hints.flatMap((h) => hintInputs(h.keys, device)), ...(device === 'kb' ? s.caps.flatMap((c) => hintInputs([c.key], 'kb')) : [])]);
      // (not where letters go into a field or a key is being captured, and not a state under two overlays)
      if (/\+search|\+capture|\+running/.test(s.sig) || /settings:(keys|pad)/.test(s.sig) || s.sig.split('+').length > 2) continue;
      for (const p of l1.filter((x) => x.state === s.sig && acts(x) && !named.has(x.input))) {
        // an arrow or Tab that only moves the focus is the keyboard's own
        if (p.to === p.state && p.settings.length === 0 && !p.changed && /Arrow|Tab|Pad:(Up|Down|Left|Right)/.test(p.input)) continue;
        hidden.push([s.sig, keyName(p.input), effect(p)]);
      }
    }
    metrics[`${device}.hintsDead`] = dead.length;
    metrics[`${device}.hiddenShortcuts`] = hidden.length;
    out.push('### 힌트가 말하는데 그 상태의 어느 포커스에서도 아무 일이 없던 키', '', dead.length ? table(['상태', '키', '힌트', '첫 포커스'], dead) : '없음', '');
    out.push('### 일을 하는데 힌트 바에도 화면의 키 표시에도 없는 키 (숨은 단축키)', '', hidden.length ? table(['상태', '키', '한 일'], hidden) : '없음', '');

    // the same key under different names
    const conflicts = [];
    for (const [input, list] of meanings) {
      const labels = uniq(list.map((m) => m.hint).filter(Boolean));
      if (labels.length > 1) conflicts.push([keyName(input), labels.length, labels.join(' / '), uniq(list.filter((m) => m.hint).map((m) => m.state.split(/[:+]/)[0])).join(', ')]);
    }
    conflicts.sort((a, b) => b[1] - a[1]);
    metrics[`${device}.keysWithSeveralLabels`] = conflicts.length;
    out.push('### 같은 키, 다른 이름 (힌트 바의 말 기준)', '', table(['키', '이름 수', '이름들', '화면'], conflicts), '');

    if (device === 'kb') {
      const leaks = l1.filter((p) => p.prevented === false && /^(F\d+|Tab|Shift\+Tab|Space|Backspace|Slash|Control\+KeyF)$/.test(p.input));
      const byKey = new Map();
      for (const p of leaks) byKey.set(p.input, [...(byKey.get(p.input) ?? []), p.state]);
      out.push('### 브라우저의 기본 동작이 남는 키', '', '페이지가 `preventDefault`하지 않은 키입니다. 브라우저에서 F5는 새로 고침, F3·Ctrl+F는 찾기, F1은 도움말, F11은 전체 화면, Tab은 브라우저 포커스 이동입니다 (데스크톱 앱에서는 메뉴가 없어 대부분 아무 일도 없습니다).', '', table(['키', '상태 수', '상태'], [...byKey].map(([k, list]) => [keyName(k), list.length, list.join(', ')])), '');
      metrics['kb.f5Unhandled'] = (byKey.get('F5') ?? []).length;
    }
  }
  write('03-keys.md', out.join('\n'));
}

// ---------------------------------------------------------------------------------------------
// the inventory
// ---------------------------------------------------------------------------------------------

function inventoryReport() {
  if (!inventory) return;
  const out = ['# 전수 조사: 화면, 항목, 설정 행', '', '`client/audit/inventory.audit.ts`가 실행 중인 게임에서 읽은 것입니다. 원본: `data/inventory.json`.', ''];
  const ok = inventory.states.filter((s) => !s.error);
  out.push('## 화면과 상태', '', table(['상태', '이름', '항목 수', '힌트(키보드)', '힌트(패드)', '화면의 키 표시'], ok.map((s) => [s.state, s.title, s.controls.length, s.hints.map((h) => `${h.keys.join(' ')} ${h.label}`).join(' · '), (s.padHints ?? []).map((h) => `${h.keys.join(' ')} ${h.label}`).join(' · '), uniq(s.caps.map((c) => c.key)).join(' ')])), '');
  const failed = inventory.states.filter((s) => s.error);
  if (failed.length) out.push('읽지 못한 상태:', '', table(['상태', '오류'], failed.map((s) => [s.state, s.error])), '');

  out.push('## 설정과 플레이 옵션의 행', '', '기본값은 저장된 설정이 없을 때의 값, 값 범위는 →를 눌러 가며 읽은 것, 저장은 그 행이 바꾸는 `grg.settings.v1`의 키입니다 (비어 있으면 저장되지 않는 값).', '');
  const byState = new Map();
  for (const r of inventory.rows) byState.set(r.state, [...(byState.get(r.state) ?? []), r]);
  for (const [state, rows] of byState) {
    out.push(`### ${ok.find((s) => s.state === state)?.title ?? state}`, '');
    out.push(
      table(
        ['이름', 'testid', '종류', '기본값', '값 범위', '저장', '도움말 글자 수', '도움말'],
        rows.map((r) => [
          r.label,
          r.testId,
          r.kind,
          r.defaultText,
          r.kind === 'number' ? `${r.min} … ${r.max} (걸음 ${r.step}, Shift ${r.bigStep})` : r.kind === 'action' ? '' : `${r.values.length}가지: ${r.values.map((v) => v.text).join(' / ')}`,
          r.stores.join(', '),
          r.help.length,
          r.help.length > 140 ? `${r.help.slice(0, 140)}…` : r.help,
        ]),
      ),
      '',
    );
  }

  // the same stored setting on more than one row
  const byKey = new Map();
  for (const r of inventory.rows) for (const k of r.stores) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  const dup = [...byKey].filter(([, rows]) => uniq(rows.map((r) => r.state)).length > 1);
  metrics['settings.rows'] = inventory.rows.length;
  metrics['settings.duplicatedKeys'] = dup.length;
  out.push('## 두 곳에 있는 설정', '', table(['저장 키', '있는 곳', '이름', '도움말이 같은가'], dup.map(([k, rows]) => [k, rows.map((r) => r.state).join(' · '), uniq(rows.map((r) => r.label)).join(' / '), uniq(rows.map((r) => r.help)).length === 1 ? '같음' : '다름'])), '');

  // stored settings no row writes
  const written = new Set(inventory.rows.flatMap((r) => r.stores.map((k) => k.split('.')[0])));
  const never = Object.keys(inventory.defaults).filter((k) => !written.has(k));
  out.push('## 행이 없는 저장 키', '', '옵션 행이 아닌 다른 방법(키 지정, 목록의 키, 곡마다의 값)으로 바뀌거나, 더는 쓰지 않는 값입니다.', '', never.map((k) => `\`${k}\``).join(', '), '');

  const helps = inventory.rows.map((r) => r.help.length).sort((a, b) => a - b);
  metrics['settings.helpMedianChars'] = helps[Math.floor(helps.length / 2)] ?? 0;
  metrics['settings.helpMaxChars'] = helps[helps.length - 1] ?? 0;
  metrics['settings.helpOver200'] = helps.filter((n) => n > 200).length;
  write('01-inventory.md', out.join('\n'));
}

// ---------------------------------------------------------------------------------------------
// layout and accessibility
// ---------------------------------------------------------------------------------------------

function layoutReport() {
  if (!layout) return;
  const out = ['# 좁은 창과 접근성 측정', '', '`client/audit/layout.audit.ts`: 모든 상태를 최소 창(960×600, 데스크톱 앱의 최소 크기)과 기본 창(1280×720)에서 쟀습니다. 원본: `data/layout.json`.', ''];
  const ok = layout.filter((r) => !r.error);
  out.push(table(['창', '상태', '잘린 글자', '창 밖 글자', '닿지 않는 항목', '24px 미만 대상', '대비 미달', '12px 미만 글자', '숨은 힌트', '포커스 표시 없음'], ok.map((r) => [r.viewport, r.state, r.clipped.length, r.offscreen.length, r.unreachable.length, r.smallTargets.length, r.lowContrast.length, r.smallText.length, r.hintsHidden.length, r.focus ? r.focus.none.length : '-'])), '');
  for (const vp of ['min', 'base']) {
    const rows = ok.filter((r) => r.viewport === vp);
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    metrics[`layout.${vp}.clipped`] = sum((r) => r.clipped.length);
    metrics[`layout.${vp}.clippedNoTitle`] = sum((r) => r.clipped.filter((c) => !c.hasTitle).length);
    metrics[`layout.${vp}.offscreen`] = sum((r) => r.offscreen.length);
    metrics[`layout.${vp}.unreachable`] = sum((r) => r.unreachable.length);
    metrics[`layout.${vp}.smallTargets`] = sum((r) => r.smallTargets.length);
    metrics[`layout.${vp}.lowContrast`] = sum((r) => r.lowContrast.length);
    metrics[`layout.${vp}.smallText`] = sum((r) => r.smallText.length);
    metrics[`layout.${vp}.hintsHidden`] = sum((r) => r.hintsHidden.length);
    metrics[`layout.${vp}.noFocusLook`] = sum((r) => (r.focus ? r.focus.none.length : 0));
  }
  const section = (title, pick, head, row) => {
    out.push(`## ${title}`, '');
    const rows = [];
    for (const r of ok) for (const x of pick(r)) rows.push([r.viewport, r.state, ...row(x)]);
    // the same thing on many states is said once
    // (and the rows of a list that differ only by a number: once, with their count)
    const merged = new Map();
    for (const r of rows) {
      const key = `${r[0]}|${r[2]}|${String(r[3]).replace(/\d+/g, '#')}`;
      const had = merged.get(key);
      merged.set(key, { row: had?.row ?? r, states: [...new Set([...(had?.states ?? []), r[1]])], count: (had?.count ?? 0) + 1 });
    }
    const list = [...merged.values()];
    out.push(list.length ? table(['창', '상태', '건수', ...head], list.slice(0, 60).map(({ row: r, states, count }) => [r[0], states.length > 3 ? `${states.slice(0, 3).join(', ')} 외 ${states.length - 3}` : states.join(', '), count, ...r.slice(2)])) : '없음', '');
    if (list.length > 60) out.push(`(외 ${list.length - 60}가지는 \`data/layout.json\`에)`, '');
  };
  section('잘린 글자', (r) => r.clipped, ['어디', '글자', '보이는 폭/필요한 폭', '말줄임', 'title'], (c) => [c.at, c.text, `${c.shownPx}/${c.needPx}`, c.ellipsis ? '…' : '잘림', c.hasTitle ? '있음' : '없음']);
  section('창 밖으로 나간 글자 (스크롤로도 못 봄)', (r) => r.offscreen, ['어디', '글자', '자리'], (c) => [c.at, c.text, c.rect.join(',')]);
  section('가려지거나 창 밖에 있는 항목', (r) => r.unreachable, ['어디', '항목', '까닭'], (c) => [c.at, c.text, c.why]);
  section('숨은 힌트', (r) => r.hintsHidden.map((t) => ({ t })), ['힌트'], (c) => [c.t]);
  section('24×24px보다 작은 대상 (WCAG 2.5.8)', (r) => r.smallTargets, ['어디', '항목', '크기'], (c) => [c.at, c.text, `${c.w}×${c.h}`]);
  section('글자 대비 미달 (WCAG 1.4.3; 그림 위 글자는 재지 않음)', (r) => r.lowContrast, ['어디', '글자', '대비', '기준', '크기', '글자색', '배경색'], (c) => [c.at, c.text, c.ratio, c.need, `${c.px}px`, c.fg, c.bg]);
  section('12px보다 작은 글자', (r) => r.smallText, ['어디', '글자', '크기'], (c) => [c.at, c.text, `${c.px}px`]);
  section('포커스를 받아도 모습이 바뀌지 않는 항목 (WCAG 2.4.7)', (r) => r.focus?.none ?? [], ['어디', '항목'], (c) => [c.at, c.text]);
  section('이름이 없는 항목 (WCAG 4.1.2)', (r) => r.unnamed, ['어디', '태그', '종류'], (c) => [c.at, c.tag, c.type]);
  write('04-layout.md', out.join('\n'));
}

function tasksReport() {
  if (!tasks) return;
  const out = ['# 과제별 비용', '', '`client/audit/tasks.audit.ts`가 과제마다 적어 둔 입력을 실제로 눌러, 목표에 닿았는지 확인한 뒤 센 것입니다. 원본: `data/tasks.json`.', '', '- **입력 수**: 누른 키(버튼)의 수. 길게 눌러 반복하는 것도 한 번씩 셉니다.', '- **시간(모델)**: KLM(Card·Moran·Newell)의 연산자로 셈한 추정값입니다. K = 0.28초(보통 타자 실력), 새 화면이나 새 묶음을 찾을 때마다 M = 1.35초. 패드 버튼에도 같은 K를 썼습니다(가정). **사람을 잰 값이 아닙니다.**', '- **앱 응답**: 마지막 입력부터 목표 상태까지 자동 실행에서 잰 시간(이 컨테이너, 소프트웨어 렌더링).', ''];
  const rows = tasks.map((t) => [t.id, t.title, t.who, t.frequency, t.kb ? (t.kb.ok ? t.kb.inputs : `실패: ${t.kb.error}`) : '-', t.kb?.ok ? `${t.kb.klm.toFixed(1)}s` : '', t.pad ? (t.pad.ok ? t.pad.inputs : `불가: ${t.pad.error}`) : '-', t.pad?.ok ? `${t.pad.klm.toFixed(1)}s` : '', t.kb?.route ?? '']);
  out.push(table(['#', '과제', '누가', '빈도(추정)', '키보드 입력 수', '시간(모델)', '패드 입력 수', '시간(모델)', '키보드 경로'], rows), '');
  for (const t of tasks) {
    metrics[`task.${t.id}.kb`] = t.kb?.ok ? t.kb.inputs : null;
    metrics[`task.${t.id}.pad`] = t.pad?.ok ? t.pad.inputs : null;
  }
  metrics['tasks.padImpossible'] = tasks.filter((t) => t.pad && !t.pad.ok).length;
  write('05-tasks.md', out.join('\n'));
}

if (graphs.kb || graphs.pad) {
  graphReport();
  keysReport();
}
inventoryReport();
layoutReport();
tasksReport();
writeFileSync(path.join(DATA, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
console.log(JSON.stringify(metrics, null, 1));
