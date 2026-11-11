import { useEffect, useRef, useState } from 'react';
import type { GearStyle } from '../render/deckArt';
import { readStandees, STAGE_SLOTS, watchStandees, writeStandees } from '../render/standees';
import { ActionOption, type RowProps } from './optionRows';

/**
 * The rows of a gear with a stage (설정 → 기어): the figures that stand at its two sides are pictures
 * the player picks from this PC, kept in this PC's storage only (render/standees.ts). A gear with no
 * stage has no such rows.
 */
export function StandeeRows(props: { gear: GearStyle; row: Pick<RowProps, 'onHelp' | 'onDefault'> }) {
  const { gear } = props;
  const slots = STAGE_SLOTS[gear] ?? 0;
  const [count, setCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!slots) return undefined;
    let live = true;
    const read = () => void readStandees(gear).then((files) => live && setCount(files.length));
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
        label={`양옆 그림 (${count}/${slots}장)`}
        testId="standee-pick"
        action="가져오기"
        onPress={() => input.current?.click()}
        help={`이 기어의 양옆에 세울 그림을 이 PC에서 고릅니다(PNG·WebP·JPEG, ${slots}장까지 한 번에). 파일 이름 순서대로 화면 왼쪽부터 섭니다: 4장이면 왼쪽 바깥, 왼쪽 안, 오른쪽 안, 오른쪽 바깥이고 2장이면 양쪽에 하나씩입니다. 배경이 투명한 그림은 그 모양대로, 배경이 있는 그림은 가장자리가 흐려진 채로 섭니다. 그림은 이 PC에만 저장되고 게임 파일에는 들어 있지 않습니다. 기어 옆에 자리가 없는 화면(좁은 창, 넓은 레인)에서는 보이지 않습니다.`}
      />
      {count > 0 && (
        <ActionOption {...props.row} label="양옆 그림 지우기" testId="standee-clear" action="지우기" onPress={() => void writeStandees(gear, [])} help="이 기어의 양옆에 세운 그림을 이 PC에서 지웁니다." />
      )}
    </>
  );
}
