// A tree test run from a terminal: one level of the menu's names is shown at a time (no screens,
// no help text), the participant picks a number, and every pick is logged. Used for the surrogate
// (subagent) findability test; a person can take it the same way.
//
//   node audit/treetest.mjs start <current|p1|p2|p3> <session>   start (or restart) a session
//   node audit/treetest.mjs pick <session> <n>                pick option n (0: back up a level)
//   node audit/treetest.mjs score                             score every session → docs/audit/08-findability.md
//
// Sessions are kept in docs/audit/findability/sessions/<session>.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '../../docs/audit/findability');
const SESSIONS = path.join(DIR, 'sessions');
const TASKS = JSON.parse(readFileSync(path.join(DIR, 'tasks.json'), 'utf8'));
const MAX_PICKS = 12;

function tree(name) {
  const root = { name: '', children: [] };
  const stack = [root];
  for (const line of readFileSync(path.join(DIR, `tree-${name}.txt`), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const depth = (line.length - line.trimStart().length) / 2;
    const node = { name: line.trim(), children: [] };
    stack.length = depth + 1;
    stack[depth].children.push(node);
    stack[depth + 1] = node;
  }
  return root.children[0];
}

const file = (session) => path.join(SESSIONS, `${session}.json`);
const load = (session) => JSON.parse(readFileSync(file(session), 'utf8'));
const save = (s) => {
  mkdirSync(SESSIONS, { recursive: true });
  writeFileSync(file(s.session), `${JSON.stringify(s, null, 1)}\n`);
};

function at(root, trail) {
  let node = root;
  for (const i of trail) node = node.children[i];
  return node;
}

/** A shuffle that depends only on the session's name (each participant gets another order). */
function order(session, n) {
  let seed = 0;
  for (const ch of session) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function show(s) {
  const root = tree(s.tree);
  if (s.at >= s.order.length) {
    console.log('모든 과제가 끝났습니다. 수고하셨습니다.');
    return;
  }
  const task = TASKS[s.order[s.at]];
  const cur = s.runs[s.at];
  const node = at(root, cur.trail);
  console.log(`\n[과제 ${s.at + 1}/${s.order.length}] ${task.text}`);
  console.log(`지금 있는 곳: ${['선곡 화면', ...cur.trail.map((_, i) => at(root, cur.trail.slice(0, i + 1)).name)].join(' > ')}`);
  node.children.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}${c.children.length ? '  ▸' : ''}`));
  if (cur.trail.length > 0) console.log('  0. (뒤로)');
  console.log(`고를 번호로 다음 명령을 실행하세요: node audit/treetest.mjs pick ${s.session} <번호>   (▸는 더 들어가는 묶음, 표시가 없는 것을 고르면 그것이 답으로 기록됩니다)`);
}

function start(name, session) {
  const s = { session, tree: name, order: order(session, TASKS.length), at: 0, runs: [{ trail: [], picks: [] }], answers: [] };
  save(s);
  console.log('메뉴 찾기 테스트입니다. 어떤 리듬게임의 메뉴 이름만 한 단계씩 보여 드립니다. 과제마다 "이 일을 하려면 어디로 가겠는가"를 생각해, 가장 그럴듯한 항목을 번호로 고르세요.');
  console.log('정답을 맞히는 시험이 아니라 메뉴 이름이 알아보기 쉬운지를 보는 것입니다. 이름만 보고 떠오르는 대로 고르고, 잘못 들어왔다 싶으면 0으로 돌아가세요. 다른 파일을 읽거나 찾아보지 마세요.');
  show(s);
}

function pick(session, n) {
  const s = load(session);
  if (s.at >= s.order.length) return show(s);
  const root = tree(s.tree);
  const cur = s.runs[s.at];
  const node = at(root, cur.trail);
  const done = (answer) => {
    s.answers.push({ task: TASKS[s.order[s.at]].id, answer, picks: cur.picks });
    s.at++;
    s.runs.push({ trail: [], picks: [] });
    save(s);
    show(s);
  };
  if (n === 0) {
    if (cur.trail.length === 0) return console.log('맨 위입니다. 1 이상의 번호를 고르세요.');
    cur.picks.push('(뒤로)');
    cur.trail.pop();
  } else {
    const child = node.children[n - 1];
    if (!child) return console.log(`번호 ${n}은 없습니다. 보이는 번호 가운데 고르세요.`);
    cur.picks.push(child.name);
    if (child.children.length === 0) {
      console.log(`"${child.name}"을(를) 답으로 기록했습니다.`);
      return done([...cur.trail.map((_, i) => at(root, cur.trail.slice(0, i + 1)).name), child.name].join(' > '));
    }
    cur.trail.push(n - 1);
  }
  if (cur.picks.length >= MAX_PICKS) {
    console.log('이 과제에서 너무 오래 헤맸습니다. 찾지 못한 것으로 기록하고 다음으로 갑니다.');
    return done(null);
  }
  save(s);
  show(s);
}

function score() {
  if (!existsSync(SESSIONS)) return console.log('no sessions');
  const sessions = readdirSync(SESSIONS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(SESSIONS, f), 'utf8')));
  const esc = (x) => String(x ?? '').replace(/\|/g, '\\|');
  const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
  const trees = ['current', 'p1', 'p2', 'p3'];
  const names = { current: '현재', p1: '제안 1 (재배치·이름)', p2: '제안 2 (재배치·이름 + 중복 제거)', p3: '제안 3 (제안 2 + 이름 다듬기)' };
  const model = (s) => (s.session.split('-')[1] ?? '?');
  /** One answer judged: the first pick on a right path, a right answer, with no step back. */
  const judge = (s, a) => {
    const task = TASKS.find((t) => t.id === a.task);
    const right = task.answers[s.tree];
    const ok = a.answer !== null && right.includes(a.answer);
    const first = a.picks[0];
    const firstOk = right.some((p) => p.split(' > ')[0] === first);
    const backs = a.picks.filter((p) => p === '(뒤로)').length;
    return { ok, firstOk, direct: ok && backs === 0, backs, picks: a.picks.length };
  };
  const out = ['# 찾기 테스트 (대리 테스트) 결과', '', '`client/audit/treetest.mjs`: 메뉴 이름만 한 단계씩 보여 주고 과제마다 번호로 고르게 한 것입니다. 참가자는 이 대화의 맥락이 없는 서브에이전트(작은 모델)입니다. **사람의 결과가 아닙니다.** 세션 기록: `findability/sessions/*.json`.', ''];
  const metrics = {};
  const summary = [];
  for (const t of trees) {
    const list = sessions.filter((s) => s.tree === t);
    if (list.length === 0) continue;
    const judged = list.flatMap((s) => s.answers.map((a) => ({ s, a, j: judge(s, a) })));
    const pct = (n) => (judged.length ? `${Math.round((n / judged.length) * 100)}%` : '-');
    const ok = judged.filter((x) => x.j.ok).length;
    const direct = judged.filter((x) => x.j.direct).length;
    const first = judged.filter((x) => x.j.firstOk).length;
    const picks = judged.reduce((n, x) => n + x.j.picks, 0) / Math.max(1, judged.length);
    summary.push([names[t], list.length, judged.length, pct(ok), pct(direct), pct(first), picks.toFixed(2)]);
    metrics[`findability.${t}.success`] = judged.length ? Math.round((ok / judged.length) * 1000) / 10 : null;
    metrics[`findability.${t}.direct`] = judged.length ? Math.round((direct / judged.length) * 1000) / 10 : null;
    metrics[`findability.${t}.firstClick`] = judged.length ? Math.round((first / judged.length) * 1000) / 10 : null;
    metrics[`findability.${t}.answers`] = judged.length;
    for (const m of ['haiku', 'sonnet']) {
      const sub = judged.filter((x) => model(x.s) === m);
      if (sub.length) metrics[`findability.${t}.${m}.success`] = Math.round((sub.filter((x) => x.j.ok).length / sub.length) * 1000) / 10;
    }
  }
  out.push('## 요약', '', table(['구조', '참가자', '답', '성공', '헤매지 않고 성공', '첫 선택이 맞는 가지', '과제당 고른 횟수'], summary), '');
  const byModel = [];
  for (const t of trees) for (const m of ['haiku', 'sonnet']) if (metrics[`findability.${t}.${m}.success`] !== undefined) byModel.push([names[t], m, `${metrics[`findability.${t}.${m}.success`]}%`]);
  out.push('모델별 성공률:', '', table(['구조', '모델', '성공'], byModel), '');

  out.push('## 과제마다', '', '칸은 "성공 / 답한 참가자" · 첫 선택이 맞은 수 · 가장 많이 고른 틀린 답입니다.', '');
  const rows = [];
  for (const task of TASKS) {
    const row = [task.id, task.text.length > 44 ? `${task.text.slice(0, 44)}…` : task.text];
    for (const t of trees) {
      const judged = sessions.filter((s) => s.tree === t).flatMap((s) => s.answers.filter((a) => a.task === task.id).map((a) => ({ a, j: judge(s, a) })));
      if (judged.length === 0) {
        row.push('-');
        continue;
      }
      const wrong = new Map();
      for (const x of judged.filter((y) => !y.j.ok)) wrong.set(x.a.answer ?? '(찾지 못함)', (wrong.get(x.a.answer ?? '(찾지 못함)') ?? 0) + 1);
      const worst = [...wrong].sort((a, b) => b[1] - a[1])[0];
      row.push(`${judged.filter((x) => x.j.ok).length}/${judged.length} · 첫 ${judged.filter((x) => x.j.firstOk).length}${worst ? ` · ✗ ${worst[0]} (${worst[1]})` : ''}`);
      metrics[`findability.${t}.${task.id}`] = `${judged.filter((x) => x.j.ok).length}/${judged.length}`;
    }
    rows.push(row);
  }
  out.push(table(['#', '과제', ...trees.map((t) => names[t])], rows), '');
  writeFileSync(path.resolve(DIR, '../08-findability.md'), out.join('\n'));
  const mPath = path.resolve(DIR, '../data/metrics.json');
  let all = {};
  try {
    all = JSON.parse(readFileSync(mPath, 'utf8'));
  } catch {
    // first run
  }
  writeFileSync(mPath, `${JSON.stringify({ ...all, ...metrics }, null, 1)}\n`);
  console.log(table(['구조', '참가자', '답', '성공', '헤매지 않고 성공', '첫 선택이 맞는 가지', '과제당 고른 횟수'], summary));
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'start') start(a, b);
else if (cmd === 'pick') pick(a, Number(b));
else if (cmd === 'score') score();
else console.log('usage: start <current|p1|p2|p3> <session> | pick <session> <n> | score');
