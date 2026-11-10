import { test, type Page } from '@playwright/test';
import { defaultSettings, ensureDemoSong, installAudit, openRoot, plugPad, press, readData, snap, STORAGE_KEY, writeData, type Device, type Root } from './lib';
import { TASKS, type Goal, type Step, type Task } from './tasks';

/**
 * The cost of each task: its inputs are pressed for real (keyboard, then pad), the goal is checked
 * on the page or in the stored settings, and the presses are counted. The time is a model
 * (Keystroke-Level Model: K = 0.28 s a press, M = 1.35 s for each new place to look), not a
 * person's.
 *
 *   AUDIT_ONLY=<regexp>   only the tasks whose id matches
 */

const K = 0.28;
const M = 1.35;
const only = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY) : null;

async function met(page: Page, goal: Goal): Promise<boolean> {
  if (goal.state !== undefined) {
    const sig = (await snap(page)).sig;
    if (!(goal.state instanceof RegExp ? goal.state.test(sig) : sig === goal.state)) return false;
  }
  if (goal.setting) {
    const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k) ?? '{}', STORAGE_KEY)) as string) as Record<string, unknown>;
    for (const [pathText, want] of Object.entries(goal.setting)) {
      let v: unknown = stored;
      for (const part of pathText.split('.')) v = (v as Record<string, unknown> | undefined)?.[part];
      if (typeof want === 'function' ? !(want as (v: unknown) => boolean)(v) : JSON.stringify(v) !== JSON.stringify(want)) return false;
    }
  }
  if (goal.visible && !(await page.getByTestId(goal.visible).first().isVisible())) return false;
  if (goal.text && !((await page.getByTestId(goal.text[0]).first().textContent()) ?? '').includes(goal.text[1])) return false;
  if (goal.focus && (await snap(page)).focus !== goal.focus) return false;
  return true;
}

interface Run {
  ok: boolean;
  inputs: number;
  klm: number;
  responseMs: number;
  route: string;
  error?: string;
}

async function run(page: Page, task: Task, device: Device, base: string): Promise<Run | null> {
  const route = device === 'kb' ? task.kb : task.pad;
  if (route === undefined) return null;
  if (route === null) return { ok: false, inputs: 0, klm: 0, responseMs: 0, route: '', error: task.padWhy ?? '경로 없음' };
  const settings = task.setup ? JSON.stringify({ ...(JSON.parse(base) as object), ...task.setup }) : base;
  await openRoot(page, (task.root ?? 'lib') as Root, settings);
  let inputs = 0;
  const pressed: string[] = [];
  const once = async (input: string) => {
    if (input.length === 1 || input.startsWith('type:')) {
      const text = input.startsWith('type:') ? input.slice(5) : input;
      await page.keyboard.type(text);
      inputs += text.length;
    } else {
      await press(page, input);
      inputs++;
    }
    pressed.push(input.replace('Arrow', '').replace('Pad:', ''));
    await page.waitForTimeout(device === 'pad' ? 60 : 90);
  };
  try {
    for (const step of route.steps as Step[]) {
      if (step === 'count:from-here') {
        // what came before only set the scene (a play that ends at once): not part of the task
        inputs = 0;
        pressed.length = 0;
      } else if (typeof step === 'string') await once(step);
      else if ('until' in step) {
        let n = 0;
        while (!(await met(page, step.until))) {
          if (++n > (step.max ?? 40)) throw new Error(`${step.press} ${n - 1}번으로도 ${JSON.stringify(step.until, (_, v) => (v instanceof RegExp ? String(v) : v))}에 닿지 않음`);
          await once(step.press);
        }
      } else if ('wait' in step) {
        await page.getByTestId(step.wait).first().waitFor({ timeout: 90_000 });
        await page.waitForTimeout(step.then ?? 300);
      }
    }
    const t0 = Date.now();
    const end = t0 + (task.goalTimeoutMs ?? 4000);
    let ok = await met(page, task.goal);
    while (!ok && Date.now() < end) {
      await page.waitForTimeout(50);
      ok = await met(page, task.goal);
    }
    const at = await snap(page);
    if (!ok && process.env.AUDIT_DEBUG) console.log(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY));
    return { ok, inputs, klm: inputs * K + route.looks * M, responseMs: Date.now() - t0, route: pressed.join(' '), error: ok ? undefined : `목표에 닿지 않음 (지금 ${at.sig} @ ${at.focus})` };
  } catch (e) {
    return { ok: false, inputs, klm: 0, responseMs: 0, route: pressed.join(' '), error: (e as Error).message.split('\n')[0] };
  }
}

test('task costs', async ({ browser }) => {
  const out: Record<string, unknown>[] = only ? ((readData('tasks.json') as Record<string, unknown>[] | null) ?? []) : [];
  let base = '';
  for (const device of ['kb', 'pad'] as Device[]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('filechooser', () => undefined);
    await installAudit(page);
    if (device === 'pad') await plugPad(page);
    await page.goto('/');
    await ensureDemoSong(page);
    if (!base) base = await defaultSettings(page);
    for (const task of TASKS) {
      if (only && !only.test(task.id)) continue;
      let r = await run(page, task, device, base);
      // a press now and then lands before the screen takes keys: a failed route is tried once more
      if (r && !r.ok && r.route) r = await run(page, task, device, base);
      let rec = out.find((t) => t.id === task.id);
      if (!rec) {
        rec = { id: task.id, title: task.title, who: task.who, frequency: task.frequency, why: task.why };
        out.push(rec);
      }
      rec[device] = r;
      console.log(`${device} ${task.id} ${task.title}: ${r === null ? '-' : r.ok ? `${r.inputs} inputs (${r.route})` : `FAILED ${r.error} (${r.route})`}`);
      writeData('tasks.json', out);
    }
    await context.close();
  }
});
