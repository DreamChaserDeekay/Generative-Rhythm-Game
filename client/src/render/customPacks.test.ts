import { describe, expect, it } from 'vitest';
import { packOverrides, parsePackList } from './customPacks';
import { BASE_SKIN, DEFAULT_PARTS, sanitizeParts, withParts } from './skins';

const LIST = parsePackList({
  folder: '/data/skins',
  packs: [
    {
      id: '내 팩',
      name: '내 팩',
      author: 'me',
      problems: [],
      parts: {
        note: { status: 'ok', message: '', warnings: [], textures: { note: { size: [1024, 256], version: 'a1' }, long: { size: [512, 256], version: 'a1' } } },
        panel: { status: 'error', message: '비율', warnings: [], textures: {} },
        hit: {
          status: 'ok',
          message: '',
          warnings: [],
          textures: {
            // still layers, as the game's own skins' (server/rhythm_server/fx_layers.py)
            hitBurst: {
              size: [1152, 768],
              layers: { cols: 3, rows: 2, light: [1, 0.8, 0.4, 0], core: [1, 0.3, 0], grow: 1.3, reach: 0.5, late: true },
              anchorY: 0.5,
              span: 1,
              plain: true,
              tone: '#ff9c45',
              version: 'b2',
            },
            hitHold: { size: [768, 512], layers: { cols: 3, rows: 2, turn: 0.9 }, span: 0.8, cored: true, version: 'b2' },
            // not a picture a pack has: left out
            other: { size: [4, 4] },
          },
        },
      },
    },
    { name: 'no id' },
  ],
});

describe("the player's own packs", () => {
  it('reads the server’s list, leaving out what is not of its shape', () => {
    expect(LIST.packs.map((p) => p.id)).toEqual(['내 팩']);
    expect(LIST.packs[0].parts.panel?.status).toBe('error');
  });

  it('keeps a pack picked per part, and draws it as the part its pictures stand in for', () => {
    const parts = sanitizeParts({ ...DEFAULT_PARTS, note: 'prism', deck: 'sky', hit: 'fire', custom: { note: '내 팩', deck: '../x', hit: '.hidden', side: 'p' } });
    // a name with a path or hidden is no pack's
    expect(parts.custom).toEqual({ note: '내 팩' });
    const style = withParts(BASE_SKIN, parts).style;
    expect(style).toMatchObject({ note: 'flat', deck: 'sky', hit: 'fire', custom: { note: '내 팩' } });
    // with none picked, nothing changes
    expect(withParts(BASE_SKIN, DEFAULT_PARTS).style).toEqual(DEFAULT_PARTS);
    expect(sanitizeParts({ custom: {} })).toEqual(DEFAULT_PARTS);
  });

  it('stands its pictures in for the game’s own, in the same sizes; a part that cannot be used draws the game’s own', () => {
    const style = withParts(BASE_SKIN, { ...DEFAULT_PARTS, custom: { note: '내 팩', deck: '내 팩', hit: '내 팩' } }).style;
    const own = packOverrides(style, LIST);
    expect(Object.keys(own).sort()).toEqual(['basic/hitBurst', 'basic/hitHold', 'longs/solid', 'notes/flat']);
    expect(own['notes/flat'].url).toBe(`/api/skins/${encodeURIComponent('내 팩')}/files/note.png?v=a1`);
    expect(own['notes/flat'].spec.size).toEqual([1024, 256]);
    expect(own['basic/hitBurst'].spec).toMatchObject({ plain: true, tone: 0xff9c45, size: [1152, 768], layers: { cols: 3, rows: 2, light: [1, 0.8, 0.4, 0], grow: 1.3, late: true } });
    expect(own['basic/hitBurst'].spec.flipbook).toBeUndefined();
    expect(own['basic/hitHold'].spec).toMatchObject({ cored: true, layers: { turn: 0.9 } });
    // a pack not in the list stands in for nothing
    expect(packOverrides(withParts(BASE_SKIN, { ...DEFAULT_PARTS, custom: { note: 'gone' } }).style, LIST)).toEqual({});
  });
});
