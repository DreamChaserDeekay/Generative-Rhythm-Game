// node --test (in desktop/)
const assert = require('node:assert/strict');
const test = require('node:test');
const { dumpSummary } = require('./crashDump');

/**
 * A minidump as Crashpad writes one, of what the summary reads: an exception on `thread` at `address`, the
 * modules, and the thread's stack (`stack`: the 64-bit values on it from the stack pointer up).
 */
function minidump({ code = 0x80000003, thread = 77, address, rip = address, modules, stack = [], x64 = true }) {
  const parts = [];
  let at = 32 + 3 * 12;
  /** Places `bytes` in the file; answers where. */
  const put = (bytes) => {
    const rva = at;
    parts.push(bytes);
    at += bytes.length;
    return rva;
  };
  const u32 = (...values) => {
    const b = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => b.writeUInt32LE(v >>> 0, i * 4));
    return b;
  };
  const u64 = (value) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(value));
    return b;
  };

  const stackBytes = Buffer.concat(stack.map(u64));
  const stackStart = 0x1000_0000n;
  const stackRva = put(stackBytes);
  const context = Buffer.alloc(x64 ? 1232 : 716);
  if (x64) {
    context.writeBigUInt64LE(stackStart, 0x98);
    context.writeBigUInt64LE(BigInt(rip), 0xf8);
  }
  const contextRva = put(context);

  const moduleEntries = modules.map((m) => {
    const name = Buffer.from(m.name, 'utf16le');
    const nameRva = put(Buffer.concat([u32(name.length), name, Buffer.alloc(2)]));
    let cv = { size: 0, rva: 0 };
    if (m.guid) {
      const record = Buffer.concat([Buffer.from('RSDS'), Buffer.from(m.guid, 'hex'), u32(m.age), Buffer.from(`${m.pdb}\0`, 'utf8')]);
      cv = { size: record.length, rva: put(record) };
    }
    const fixed = Buffer.alloc(52);
    if (m.version) {
      fixed.writeUInt32LE(((m.version[0] << 16) | m.version[1]) >>> 0, 8);
      fixed.writeUInt32LE(((m.version[2] << 16) | m.version[3]) >>> 0, 12);
    }
    return Buffer.concat([u64(m.base), u32(m.size, 0, 0, nameRva), fixed, u32(cv.size, cv.rva, 0, 0), u64(0), u64(0)]);
  });
  const moduleList = put(Buffer.concat([u32(modules.length), ...moduleEntries]));
  const moduleSize = 4 + modules.length * 108;

  // one thread, the one that crashed: id, three numbers, the TEB, the stack (start, size, where), its context
  const threadList = put(Buffer.concat([u32(1), u32(thread, 0, 0, 0), u64(0), u64(stackStart), u32(stackBytes.length, stackRva), u32(context.length, contextRva)]));
  const exception = put(Buffer.concat([u32(thread, 0, code, 0), u64(0), u64(address), u32(0, 0), Buffer.alloc(15 * 8), u32(context.length, contextRva)]));

  const header = Buffer.concat([u32(0x504d444d, 0xa793, 3, 32, 0, 0), u64(0)]);
  const directory = Buffer.concat([u32(3, 4 + 48, threadList), u32(4, moduleSize, moduleList), u32(6, 168, exception)]);
  return Buffer.concat([header, directory, ...parts]);
}

const APP = { name: 'C:\\Users\\me\\AppData\\Local\\Programs\\Generative Rhythm\\Generative Rhythm.exe', base: 0x7ff6_0000_0000n, size: 0x0c00_0000, version: [44, 5, 1, 0], guid: '00112233445566778899aabbccddeeff', age: 1, pdb: 'C:\\b\\electron.exe.pdb' };
const DRIVER = { name: 'C:\\Windows\\System32\\DriverStore\\nvwgf2umx.dll', base: 0x7ffa_1000_0000n, size: 0x0200_0000, version: [32, 0, 16, 1714] };
const D3D = { name: 'C:\\Windows\\System32\\d3d11.dll', base: 0x7ffb_0000_0000n, size: 0x0030_0000 };

test('where a process crashed: the module and the offset of the instruction, and the return addresses on its stack', () => {
  const dump = minidump({
    address: APP.base + 0x3a4f21cn,
    modules: [APP, DRIVER, D3D],
    // what lies on a stack: places in modules (return addresses), and the rest (numbers, the heap, the stack itself)
    stack: [0x10n, APP.base + 0x3a4f000n, 0x1000_0040n, APP.base + 0x3a4f000n, DRIVER.base + 0x1a2b3cn, 0x7fff_ffff_ffffn, D3D.base + 0x1234n, APP.base + 0x3a4f21cn, APP.base + 0x10n],
  });
  assert.deepEqual(dumpSummary(dump), {
    code: '0x80000003',
    thread: 77,
    at: 'Generative Rhythm.exe+0x3a4f21c',
    ip: undefined,
    // (the same place twice running is told once; the place of the crash itself is not told again)
    frames: ['Generative Rhythm.exe+0x3a4f000', 'nvwgf2umx.dll+0x1a2b3c', 'd3d11.dll+0x1234', 'Generative Rhythm.exe+0x10'],
    modules: [
      // the identifier a module's symbols are published under: its GUID as Windows writes one, then its age
      { name: 'Generative Rhythm.exe', version: '44.5.1.0', id: '33221100554477668899AABBCCDDEEFF1', pdb: 'electron.exe.pdb' },
      { name: 'nvwgf2umx.dll', version: '32.0.16.1714', id: undefined, pdb: undefined },
      { name: 'd3d11.dll', version: undefined, id: undefined, pdb: undefined },
    ],
  });
});

test('a crash at no instruction of a module, and the instruction the thread was at', () => {
  // an access to memory that is not there (a null pointer): "at" the memory, the instruction beside it
  const dump = minidump({ code: 0xc0000005, address: 0n, rip: DRIVER.base + 0x99n, modules: [APP, DRIVER], stack: [APP.base + 0x20n] });
  const s = dumpSummary(dump);
  assert.deepEqual([s.code, s.at, s.ip, s.frames], ['0xC0000005', '0x0', 'nvwgf2umx.dll+0x99', ['Generative Rhythm.exe+0x20']]);
  // a process of another kind (not x64): where it crashed, and no stack
  const other = dumpSummary(minidump({ address: APP.base + 0x30n, modules: [APP], stack: [APP.base + 0x20n], x64: false }));
  assert.deepEqual([other.at, other.ip, other.frames], ['Generative Rhythm.exe+0x30', undefined, []]);
});

test('what is no crash dump, or a broken one, is null or as much as can be read: never an error', () => {
  for (const not of [null, undefined, 'MDMP', Buffer.alloc(0), Buffer.alloc(64), Buffer.from('not a dump at all, only some text of about the right length')]) assert.equal(dumpSummary(not), null);
  const dump = minidump({ address: APP.base + 0x3a4f21cn, modules: [APP, DRIVER], stack: [APP.base + 0x20n, DRIVER.base + 0x30n] });
  // cut anywhere: no throw
  for (let length = 0; length < dump.length; length += 7) assert.doesNotThrow(() => dumpSummary(dump.subarray(0, length)));
  // a dump with no word of an exception (one taken of a live process)
  const live = Buffer.from(dump);
  live.writeUInt32LE(0xff, 32 + 2 * 12);
  assert.equal(dumpSummary(live), null);
  // every number in it turned to nonsense: still no throw
  const noise = Buffer.from(dump);
  for (let i = 32; i < noise.length; i += 3) noise[i] = 0xff;
  assert.doesNotThrow(() => dumpSummary(noise));
});
