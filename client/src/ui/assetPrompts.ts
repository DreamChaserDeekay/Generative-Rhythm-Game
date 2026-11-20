/**
 * The prompts a player copies (설정 → 기어 · 노트 → 프롬프트 복사) to make a pack's pictures with an image model of
 * their own (ChatGPT, Gemini, …): one per picture, in Korean and English, each with a place for the look the player
 * wants. Taken from what worked for the game's own pictures (scripts/assets/make_long_notes.py, make_skin_fx.py,
 * deck_panels/): a flat view straight from above, the parts that must stay where the game puts them, neutral greys
 * where the game tints, one flat background colour the game can take out, no text. docs/CUSTOM_ASSETS.md has them too
 * (kept the same: assetPrompts.test.ts).
 */

export type PromptKind = 'note' | 'long' | 'panel' | 'hit';
export type PromptLanguage = 'ko' | 'en';

/** Where the player writes the look they want. */
export const STYLE_SLOT = { ko: '[원하는 분위기: 예) 반짝이는 크롬, 네온 사이버펑크, 수채화 종이]', en: '[YOUR STYLE: e.g. polished chrome, neon cyberpunk, watercolour paper]' } as const;

/** The file each picture is saved as in the pack's folder. */
export const PROMPT_FILE: Record<PromptKind, string> = { note: 'note.png', long: 'long.png', panel: 'panel.png', hit: 'hit.png' };

export const PROMPT_LABEL: Record<PromptKind, string> = { note: '단노트', long: '롱노트', panel: '기어 받침', hit: '타격 효과' };

const PROMPTS: Record<PromptKind, Record<PromptLanguage, string>> = {
  note: {
    en: [
      'A single TAP NOTE for a rhythm game, seen straight from above: one wide, flat horizontal bar about 4 times wider than tall, centred, filling about 90% of the image width.',
      `Style: ${STYLE_SLOT.en}.`,
      'Colour: neutral greys and white ONLY, no hue at all (the game colours the note with each lane\'s colour; light grey shows the lane colour, near white glows).',
      'Its lower long edge is perfectly straight, crisp and the brightest edge of the bar. Detail may sit at its two ends and in its middle; the stretches between them stay plain and even (the game stretches them to the lane\'s width).',
      'Strictly orthographic, no perspective, no tilt, no shadow cast around it.',
      'Background: one solid flat pure magenta (#FF00FF) from edge to edge, with nothing else on it and no magenta inside the note.',
      'No text, letters, numbers, logos or watermarks.',
    ].join('\n'),
    ko: [
      '리듬 게임의 단노트 하나를 바로 위에서 내려다본 그림: 가로가 세로의 약 4배인 넓고 납작한 가로 막대 하나, 가운데에 그림 폭의 약 90%로.',
      `스타일: ${STYLE_SLOT.ko}.`,
      '색: 회색과 흰색만, 색조는 전혀 없이(게임이 레인마다 색을 입힙니다. 밝은 회색은 레인 색으로, 흰색에 가까운 곳은 빛나게 보입니다).',
      '아래쪽 긴 가장자리는 완전히 곧고 선명하며 막대에서 가장 밝게. 장식은 양 끝과 가운데에만 두고, 그 사이 구간은 고르고 밋밋하게(게임이 레인 폭에 맞춰 늘립니다).',
      '완전한 정사영, 원근 · 기울기 없음, 둘레에 그림자 없음.',
      '배경: 가장자리까지 순수한 마젠타(#FF00FF) 한 색, 다른 것은 아무것도 없이. 노트 안에는 마젠타를 쓰지 말 것.',
      '글자, 숫자, 로고, 워터마크 없음.',
    ].join('\n'),
  },
  long: {
    en: [
      'The LONG NOTE of a rhythm game, seen straight from above: one long upright rail, about 4 times taller than wide, centred, standing from near the top to near the bottom of the image.',
      `Style: ${STYLE_SLOT.en} (the same material as the tap note).`,
      'Colour: neutral greys and white ONLY, no hue at all (the game colours it with the lane\'s colour).',
      'Along its whole length the rail looks exactly the same, so any stretch of it repeats seamlessly: no gradient from top to bottom, no one-off details; any mark down it evenly spaced. Its top end is closed by the rail\'s own end.',
      'Strictly orthographic, no perspective, no shadow.',
      'Background: one solid flat pure magenta (#FF00FF) from edge to edge, nothing else on it, no magenta in the rail.',
      'No text, letters, numbers, logos or watermarks.',
    ].join('\n'),
    ko: [
      '리듬 게임의 롱노트를 바로 위에서 내려다본 그림: 세로가 가로의 약 4배인 긴 세로 레일 하나, 가운데에 그림 위 끝 가까이부터 아래 끝 가까이까지.',
      `스타일: ${STYLE_SLOT.ko} (단노트와 같은 재질).`,
      '색: 회색과 흰색만, 색조는 전혀 없이(게임이 레인 색을 입힙니다).',
      '레일은 길이 전체에서 똑같이 보여 어느 구간을 이어 붙여도 이음매가 없게: 위아래로 밝기가 변하지 않고, 한 번만 있는 장식 없이, 무늬는 같은 간격으로. 위 끝은 레일 자신의 끝으로 닫힘.',
      '완전한 정사영, 원근 없음, 그림자 없음.',
      '배경: 가장자리까지 순수한 마젠타(#FF00FF) 한 색, 다른 것 없이. 레일 안에는 마젠타를 쓰지 말 것.',
      '글자, 숫자, 로고, 워터마크 없음.',
    ].join('\n'),
  },
  panel: {
    en: [
      'The attached image is a LAYOUT TEMPLATE for the lower panel of a rhythm game\'s gear (the slab under the row of keys). Draw a new picture with EXACTLY its framing and proportions (about 21:9, 2.34 : 1): the same width and height, nothing cropped, nothing added around it.',
      'In the template: the cyan line along the top edge is where the panel meets the row of keys (the far edge); the area above the dashed amber line is what most players see, so the important parts of the design go there, around the faint middle line; the area below it is seen only with some cameras.',
      `The panel: ${STYLE_SLOT.en}. A finished surface of a game console seen straight from above, flat (no perspective), filling the whole picture edge to edge.`,
      'Keep its middle calm (notes and effects are drawn just above it). Mostly darker tones, so the notes stand out.',
      'Remove every guide of the template: no cyan line, no dashed line, no middle line, no grey placeholder left.',
      'No text, letters, numbers, logos or watermarks.',
    ].join('\n'),
    ko: [
      '첨부한 그림은 리듬 게임 기어의 아랫부분(건반 줄 아래의 받침)의 배치 밑그림입니다. 이 그림과 똑같은 구도와 비율(약 21:9, 2.34 : 1)로 새 그림을 그려 주세요: 같은 가로세로, 잘라 내거나 둘레에 덧붙이지 말 것.',
      '밑그림에서: 위 가장자리의 하늘색 줄은 받침이 건반 줄과 맞닿는 곳(먼 쪽 가장자리)입니다. 주황 점선 위쪽이 대부분의 플레이어에게 보이는 부분이니 디자인의 중요한 것은 그곳, 희미한 가운데 선 둘레에 둡니다. 그 아래는 일부 카메라에서만 보입니다.',
      `받침: ${STYLE_SLOT.ko}. 게임 기기의 완성된 표면을 바로 위에서 내려다본 평면(원근 없음)으로, 그림 전체를 가장자리까지 채움.`,
      '가운데는 차분하게(노트와 효과가 바로 위에 그려집니다). 전체적으로 어두운 편이어서 노트가 잘 보이게.',
      '밑그림의 안내선은 모두 지울 것: 하늘색 줄, 점선, 가운데 선, 회색 바탕이 남지 않게.',
      '글자, 숫자, 로고, 워터마크 없음.',
    ].join('\n'),
  },
  hit: {
    en: [
      'One single frame of a rhythm game\'s HIT EFFECT: the instant a note is struck, a burst of light seen straight from above, at its very brightest and fullest.',
      `Style: ${STYLE_SLOT.en}.`,
      'Centred, radiating out evenly in every direction from the middle of the image; a white-hot core and light in the effect\'s colours around it. The outer 15% of the image on every side stays empty black.',
      'Background: pure black (#000000) everywhere outside the light (the game adds the picture to the screen as light, so black is invisible). No smoke, no dark shapes, no ground, no shadow.',
      'Square image (1:1). No text, letters, numbers, logos or watermarks.',
    ].join('\n'),
    ko: [
      '리듬 게임 타격 효과의 한 장면: 노트를 친 순간의 빛이 터지는 모습을 바로 위에서 본 것, 가장 밝고 가장 꽉 찬 순간.',
      `스타일: ${STYLE_SLOT.ko}.`,
      '그림 한가운데에서 사방으로 고르게 퍼짐. 가운데는 하얗게 빛나는 심, 그 둘레는 효과의 색으로. 그림 가장자리 15%는 사방 모두 빈 검정.',
      '배경: 빛 바깥은 모두 순수한 검정(#000000)(게임은 그림을 빛으로 화면에 더하므로 검정은 보이지 않습니다). 연기, 어두운 모양, 바닥, 그림자 없음.',
      '정사각형(1:1). 글자, 숫자, 로고, 워터마크 없음.',
    ].join('\n'),
  },
};

export function promptOf(kind: PromptKind, language: PromptLanguage): string {
  return PROMPTS[kind][language];
}

export const PROMPT_KINDS: readonly PromptKind[] = ['note', 'long', 'panel', 'hit'];
