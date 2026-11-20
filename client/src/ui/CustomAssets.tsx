import { useCallback, useEffect, useState } from 'react';
import { loadPacks, PACK_PART, reloadPacks, templateUrl, usablePart, type Pack, type PackList } from '../render/customPacks';
import type { CustomPart, SkinParts } from '../render/skins';
import { promptOf, PROMPT_FILE, PROMPT_LABEL, type PromptKind, type PromptLanguage } from './assetPrompts';
import { ActionOption, Choice, type RowProps } from './optionRows';

/**
 * The player's own asset packs in the settings (docs/CUSTOM_ASSETS.md): each part's row lists "내 에셋: <팩>" after the
 * game's own (packChoices), and under the rows of 기어 and 노트 are the packs' rows: open the folder, read it again, copy
 * a prompt, save a layout template, and every pack with what of it can be used and why not.
 */

/** A pack picked in a part's row: its value there. */
const PACK = 'pack:';

/** The packs, asked once; `reload` asks again and says so (the preview is drawn again with what it read). */
export function usePacks(): { packs: PackList | null; version: number; reload: () => Promise<PackList> } {
  const [packs, setPacks] = useState<PackList | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void loadPacks().then((list) => live && setPacks(list));
    return () => {
      live = false;
    };
  }, []);
  const reload = useCallback(async () => {
    const list = await reloadPacks();
    setPacks(list);
    setVersion((v) => v + 1);
    return list;
  }, []);
  return { packs, version, reload };
}

/** A part's value in its row: the pack picked for it, else the game's own part. */
export function partValue(parts: SkinParts, part: CustomPart): string {
  const pack = parts.custom?.[part];
  return pack ? PACK + pack : parts[part];
}

/** A part's row's choices: the game's own, then the packs whose part can be used (and the one picked, should it no longer be). */
export function packChoices(own: [string, string][], part: CustomPart, packs: PackList | null, picked: string | undefined): [string, string][] {
  const out = [...own];
  for (const p of packs?.packs ?? []) if (usablePart(p, part)) out.push([PACK + p.id, `내 에셋: ${p.name}`]);
  if (picked && !out.some(([v]) => v === PACK + picked)) out.push([PACK + picked, `내 에셋: ${picked} (읽지 못함)`]);
  return out;
}

/** The parts after a part's row is changed to `value`: a pack picked for it, or the game's own part (its pack let go). */
export function withPartValue(parts: SkinParts, part: CustomPart, value: string): SkinParts {
  const custom = { ...parts.custom };
  const pack = value.startsWith(PACK);
  if (pack) custom[part] = value.slice(PACK.length);
  else delete custom[part];
  const next: SkinParts = pack ? { ...parts } : { ...parts, [part]: value };
  if (Object.keys(custom).length > 0) next.custom = custom;
  else delete next.custom;
  return next;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // (a page without the clipboard's permission): the old way
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  }
}

function download(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type Desktop = { openSkinsFolder?: () => Promise<boolean> };
const desktop = (): Desktop | null => (window as unknown as { grgDesktop?: Desktop }).grgDesktop ?? null;

const STATUS_TEXT = { ok: '사용 가능', error: '문제 있음', missing: '없음' } as const;

/** One pack's line: its name and maker, and each of the tab's parts: usable, why not, or not in it. */
function PackLine({ pack, parts }: { pack: Pack; parts: CustomPart[] }) {
  return (
    <li className="pack-line" data-testid={`pack-${pack.id}`}>
      <b>{pack.name}</b>
      {pack.author && <span className="pack-author"> · {pack.author}</span>}
      {pack.problems.map((p) => (
        <span key={p} className="pack-problem">
          {p}
        </span>
      ))}
      <ul>
        {parts.map((part) => {
          const p = pack.parts[PACK_PART[part]];
          const status = p?.status ?? 'missing';
          return (
            <li key={part} data-status={status} data-testid={`pack-${pack.id}-${part}`}>
              <span className="pack-part">{part === 'note' ? '노트' : part === 'deck' ? '기어 받침' : '타격 효과'}</span>: {STATUS_TEXT[status]}
              {p?.message && <span className="pack-problem"> {p.message}</span>}
              {p?.warnings.map((w) => (
                <span key={w} className="pack-warning">
                  {' '}
                  {w}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/** The packs' rows under a tab's rows: `parts` the tab's (노트: note; 기어: deck and hit). */
export function CustomAssetRows({ row, parts, packs, reload }: { row: Pick<RowProps, 'onHelp' | 'onDefault'>; parts: CustomPart[]; packs: PackList | null; reload: () => Promise<PackList> }) {
  const [language, setLanguage] = useState<PromptLanguage>('ko');
  const kinds: PromptKind[] = parts.includes('note') ? ['note', 'long'] : ['panel', 'hit'];
  const shell = desktop();
  const folderHelp = `에셋 팩 폴더: ${packs?.folder || '데이터 폴더의 skins'}. 그 안에 팩마다 폴더를 만들고 note · long · panel · hit 이름으로 그림을 넣습니다(png · webp · jpg).`;
  return (
    <div className="settings-group" data-testid="custom-assets">
      <h3>내 에셋</h3>
      {shell?.openSkinsFolder && (
        <ActionOption
          {...row}
          label="에셋 폴더 열기"
          testId="open-skins-folder"
          action="열기"
          onPress={() => void shell.openSkinsFolder?.()}
          help={folderHelp}
        />
      )}
      <ActionOption
        {...row}
        label="에셋 다시 읽기"
        testId="reload-skins"
        action="읽기"
        onPress={() =>
          void reload().then((list) => {
            const broken = list.packs.filter((p) => parts.some((part) => p.parts[PACK_PART[part]]?.status === 'error')).length;
            row.onHelp(`팩 ${list.packs.length}개를 읽었습니다${broken ? `. ${broken}개에 문제가 있습니다(아래 목록).` : '.'}`);
          })
        }
        help={`폴더에 넣거나 바꾼 그림을 다시 읽습니다. ${folderHelp}`}
      />
      <Choice
        {...row}
        label="프롬프트 언어"
        testId="prompt-language"
        value={language}
        options={[
          ['ko', '한국어'],
          ['en', 'English'],
        ]}
        onChange={setLanguage}
        help="복사할 프롬프트의 언어입니다. 이미지 모델 대부분은 영어 프롬프트를 더 정확히 따릅니다."
      />
      {kinds.map((kind) => (
        <ActionOption
          key={kind}
          {...row}
          label={`${PROMPT_LABEL[kind]} 프롬프트`}
          testId={`copy-prompt-${kind}`}
          action="복사"
          onPress={() =>
            void copyText(promptOf(kind, language)).then((done) =>
              row.onHelp(
                done
                  ? `${PROMPT_LABEL[kind]} 프롬프트를 복사했습니다. 대괄호 안을 원하는 분위기로 바꿔 이미지 모델(ChatGPT, Gemini 등)에 넣고${kind === 'panel' ? ' 받침 밑그림을 함께 첨부하세요. 받은' : ' 받은'} 그림을 팩 폴더에 ${PROMPT_FILE[kind]}로 저장하세요.`
                  : '복사하지 못했습니다.',
              ),
            )
          }
          help={`${PROMPT_LABEL[kind]} 그림을 만들 프롬프트를 클립보드에 복사합니다. 결과는 팩 폴더에 ${PROMPT_FILE[kind]}로 넣습니다.${kind === 'long' ? ' 롱노트 그림이 없으면 단노트로 만듭니다.' : ''}${kind === 'hit' ? ' 게임이 그림 한 장으로 퍼지고 사라지는 움직임을 만듭니다(4×4 시트를 hit_sheet로 넣어도 됩니다).' : ''}`}
        />
      ))}
      <ActionOption
        {...row}
        label={parts.includes('note') ? '노트 밑그림 저장' : '받침 밑그림 저장'}
        testId={parts.includes('note') ? 'save-template-note' : 'save-template-panel'}
        action="저장"
        onPress={() => download(templateUrl(parts.includes('note') ? 'note' : 'panel'), parts.includes('note') ? 'layout-note.png' : 'layout-panel.png')}
        help={
          parts.includes('note')
            ? '노트의 비율과 늘어나는 구간(어두운 회색)을 그린 밑그림입니다. 원하면 노트 프롬프트와 함께 첨부합니다.'
            : '받침의 비율과 배치를 그린 밑그림입니다: 위 하늘색 줄이 건반 줄과 맞닿는 곳, 주황 점선 위가 기본 카메라에서 보이는 부분입니다. 받침 프롬프트와 함께 첨부하세요. 키 모드와 상관없이 한 장입니다.'
        }
      />
      <ul className="pack-list" data-testid="pack-list">
        {packs === null && <li className="pack-line">읽는 중…</li>}
        {packs !== null && packs.packs.length === 0 && <li className="pack-line">에셋 팩이 없습니다. 에셋 폴더에 팩 폴더를 만들어 그림을 넣으세요.</li>}
        {packs?.packs.map((p) => (
          <PackLine key={p.id} pack={p} parts={parts} />
        ))}
      </ul>
    </div>
  );
}
