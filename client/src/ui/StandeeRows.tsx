import { useEffect, useRef, useState } from 'react';
import type { GearStyle } from '../render/deckArt';
import { readNotePicture, readStandees, STAGES, watchStandees, writeStandees } from '../render/standees';
import { ActionOption, type RowProps } from './optionRows';

/**
 * The rows of a gear with a stage (설정 → 기어): the pictures at its two sides (and, an AI company's
 * gear, the mark its skin's notes are cut in) are pictures the player picks from this PC, kept in this
 * PC's storage only (render/standees.ts). A gear with no stage has no such rows.
 */
export function StandeeRows(props: { gear: GearStyle; row: Pick<RowProps, 'onHelp' | 'onDefault'> }) {
  const { gear } = props;
  const stage = STAGES[gear];
  const slots = stage?.slots ?? 0;
  const [count, setCount] = useState(0);
  const [marked, setMarked] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!slots) return undefined;
    let live = true;
    const read = () => {
      void readStandees(gear).then((files) => live && setCount(files.length));
      void readNotePicture(gear).then((file) => live && setMarked(file !== null));
    };
    read();
    const stop = watchStandees(read);
    return () => {
      live = false;
      stop();
    };
  }, [gear, slots]);
  if (!slots) return null;
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple
        hidden
        data-testid="standee-files"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length > 0) void writeStandees(gear, files.map((f) => ({ name: f.name, blob: f })));
        }}
      />
      <ActionOption
        {...props.row}
        label={stage?.note ? `양옆 그림 (${count}/${slots}장) · 노트 그림 (${marked ? 1 : 0}/1장)` : `양옆 그림 (${count}/${slots}장)`}
        testId="standee-pick"
        action="가져오기"
        onPress={() => input.current?.click()}
        help={
          stage?.kind === 'stickers'
            ? `이 기어의 하단 양옆에 붙일 그림 ${slots}장과 노트 모양이 될 그림 1장을 이 PC에서 고릅니다(PNG·WebP·JPEG, 한 번에). 양옆 그림은 파일 이름 순서대로 왼쪽, 오른쪽 아래 모서리에 기어 앞으로 겹쳐 붙고(화면 높이의 3분의 1까지, 흰 테두리가 둘러지고, 판정선은 가리지 않습니다) 이름에 note나 logo(노트, 로고)가 들어간 그림은 노트가 됩니다: 그 그림의 모양 그대로 레인 색으로 그립니다. 이름이 gpt-, gemini-, grok-, claude-로 시작하는 파일은 그 기어의 그림으로 들어가므로 네 기어의 그림을 한 번에 골라도 됩니다. 그림은 이 PC에만 저장되고 게임 파일에는 들어 있지 않습니다. 노트 그림이 없으면 노트는 동그란 모양으로 나옵니다.`
            : `이 기어의 양옆에 세울 그림을 이 PC에서 고릅니다(PNG·WebP·JPEG, ${slots}장까지 한 번에). 파일 이름 순서대로 화면 왼쪽부터 섭니다. 2장이면 양쪽에 하나씩 크게 서서 기어 옆을 채우고(화면 높이만큼, 안쪽 3분의 1은 기어 뒤로) 4장이면 왼쪽 바깥, 왼쪽 안, 오른쪽 안, 오른쪽 바깥에 작게 섭니다. 배경이 투명한 그림은 그 모양대로, 배경이 있는 그림은 가장자리가 흐려진 채로 섭니다. 그림은 이 PC에만 저장되고 게임 파일에는 들어 있지 않습니다. 기어 옆에 자리가 없는 화면(좁은 창, 넓은 레인)에서는 보이지 않습니다.`
        }
      />
      {(count > 0 || marked) && (
        <ActionOption {...props.row} label="양옆 그림 지우기" testId="standee-clear" action="지우기" onPress={() => void writeStandees(gear, [])} help="이 기어의 양옆 그림(과 노트 그림)을 이 PC에서 지웁니다." />
      )}
    </>
  );
}
