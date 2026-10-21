import { describe, expect, it } from 'vitest';
import { chartTexts, namedPictures, pictureStem, picturesOf } from './importPictures';

describe('the pictures a chart package names', () => {
  it('reads BMS, osu! and bmson', () => {
    expect(picturesOf('a.bme', '#TITLE x\r\n#STAGEFILE Stage.bmp\r\n#BANNER banner 1.png \r\n#BPM 120')).toEqual(['Stage.bmp', 'banner 1.png']);
    expect(picturesOf('a.bms', '#TITLE x')).toEqual([]);
    expect(picturesOf('a.osu', 'osu file format v14\n[Events]\n//Background and Video events\n0,0,"bg 1.jpg",0,0\nVideo,0,"v.mp4"\n')).toEqual(['bg 1.jpg']);
    expect(picturesOf('a.osu', '[Events]\n0,0,bg.png\n')).toEqual(['bg.png']);
    expect(picturesOf('a.osu', '[General]\n0,0,"x.jpg"\n')).toEqual([]);
    expect(picturesOf('a.osu', '[Events]\n//Break Periods\n\n[TimingPoints]\n0,500,4,2,0,60,1,0\n')).toEqual([]);
    expect(picturesOf('a.bmson', JSON.stringify({ info: { eyecatch_image: 'eye.png', banner_image: '', back_image: 'back.png' } }))).toEqual(['eye.png']);
    expect(picturesOf('a.bmson', '{not json')).toEqual([]);
  });

  it('reads a BMS written in Shift_JIS or EUC-KR as well as UTF-8', async () => {
    // "#STAGEFILE 背景.bmp" in Shift_JIS, "#STAGEFILE 배경.bmp" in EUC-KR
    const sjis = new Uint8Array([...Buffer.from('#STAGEFILE '), 0x94, 0x77, 0x8c, 0x69, ...Buffer.from('.bmp\r\n')]);
    const euc = new Uint8Array([...Buffer.from('#STAGEFILE '), 0xb9, 0xe8, 0xb0, 0xe6, ...Buffer.from('.bmp\r\n')]);
    expect(chartTexts(new Uint8Array(Buffer.from('#STAGEFILE 背景.png')))).toEqual(['#STAGEFILE 背景.png']);
    expect(chartTexts(sjis).some((t) => picturesOf('a.bms', t).includes('背景.bmp'))).toBe(true);
    expect(chartTexts(euc).some((t) => picturesOf('a.bms', t).includes('배경.bmp'))).toBe(true);
    const file = (name: string, bytes: Uint8Array<ArrayBuffer>) => ({ file: new File([bytes], name), path: name });
    const files = [file('a.bme', sjis), file('背景.png', new Uint8Array([1])), file('other.png', new Uint8Array([1]))];
    const sent = await namedPictures(files, (n) => /\.bme$/.test(n), (n) => /\.png$/.test(n));
    expect(sent.map((f) => f.path)).toEqual(['背景.png']);
  });

  it('matches a picture whatever its folder, case and extension', () => {
    expect(pictureStem('Song/Stage.BMP')).toBe('stage');
    expect(pictureStem('stage.png')).toBe('stage');
    expect(pictureStem('C:\\pack\\bg.jpeg')).toBe('bg');
  });
});
