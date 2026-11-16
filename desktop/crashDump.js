// What a crash dump says of the crash (graphics.log's crash-dump lines, see main.js). When a process of the
// app crashes, Crashpad (Electron's crash reporter, which the app runs without sending anything anywhere)
// writes a minidump beside the logs. An exit code alone (0x80000003, a breakpoint: Chromium stopping itself
// on a check, or a driver doing so) does not tell where it stopped; the dump does: the module and the offset
// in it of the instruction, and the return addresses on the crashed thread's stack. Those read as names with
// the module's symbols (Electron publishes its own), so one loss on a player's PC is enough to tell a driver's
// fault from the browser's own stop, and at which step. Kept apart from main.js so that it runs under
// node --test; the format is Microsoft's (minidumpapiset.h), little-endian throughout.

const SIGNATURE = 0x504d444d; // "MDMP"
const THREAD_LIST = 3;
const MODULE_LIST = 4;
const EXCEPTION = 6;
const THREAD_SIZE = 48;
const MODULE_SIZE = 108;
/**
 * The x64 CONTEXT: its size (a dump may keep more after it: the extended registers), where its flags are and
 * the one that says x64, and where the stack pointer and the instruction pointer are in it.
 */
const CONTEXT_X64 = { size: 1232, flags: 0x30, amd64: 0x00100000, rsp: 0x98, rip: 0xf8 };
/** How far up the crashed thread's stack is looked through, and how many return addresses are kept. */
const STACK_SLOTS = 4096;
const FRAMES = 24;
const MODULES = 6;
/** A dump larger than this is not read (a GPU process's is a few MB). */
const MAX_DUMP_BYTES = 64 * 1024 * 1024;

const hex = (n) => `0x${n.toString(16)}`;

/** A reader of `buffer` that answers undefined past its end instead of throwing. */
function reader(buffer) {
  const ok = (at, size) => Number.isInteger(at) && at >= 0 && at + size <= buffer.length;
  return {
    u16: (at) => (ok(at, 2) ? buffer.readUInt16LE(at) : undefined),
    u32: (at) => (ok(at, 4) ? buffer.readUInt32LE(at) : undefined),
    u64: (at) => (ok(at, 8) ? buffer.readBigUInt64LE(at) : undefined),
    bytes: (at, size) => (ok(at, size) ? buffer.subarray(at, at + size) : undefined),
  };
}

/** A module's name without its folder. */
const baseName = (name) => String(name).replace(/^.*[\\/]/, '');

/**
 * What the dump holds: null when it is no minidump or says nothing of a crash, else
 *   code     the exception's code ("0x80000003")
 *   thread   the thread that crashed
 *   at       where: "module+0xoffset" (the address itself when it lies in no module)
 *   ip       the instruction the thread was at, in the same form, when the dump has it and it is another
 *            place (an access to memory that is not there is "at" that memory, not at an instruction)
 *   frames   the return addresses found on that thread's stack from its top, in the same form (a scan: an
 *            address a function left behind earlier may be among them)
 *   modules  the modules named in `at` and `frames`: { name, version, id, pdb }, `id` being the identifier
 *            its symbols are published under
 */
function dumpSummary(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return null;
  const r = reader(buffer);
  if (r.u32(0) !== SIGNATURE) return null;
  const count = r.u32(8);
  const directory = r.u32(12);
  const streams = new Map();
  for (let i = 0; i < Math.min(count, 256); i++) {
    const type = r.u32(directory + i * 12);
    const size = r.u32(directory + i * 12 + 4);
    const rva = r.u32(directory + i * 12 + 8);
    if (type === undefined || size === undefined || rva === undefined) break;
    if (!streams.has(type)) streams.set(type, { size, rva });
  }
  const exception = streams.get(EXCEPTION);
  if (!exception || exception.size < 168) return null;
  const thread = r.u32(exception.rva);
  const code = r.u32(exception.rva + 8);
  const address = r.u64(exception.rva + 24);
  const contextSize = r.u32(exception.rva + 160);
  const contextRva = r.u32(exception.rva + 164);
  if (thread === undefined || code === undefined || address === undefined) return null;

  const modules = [];
  const list = streams.get(MODULE_LIST);
  const moduleCount = list ? Math.min(r.u32(list.rva) ?? 0, 2048) : 0;
  for (let i = 0; i < moduleCount; i++) {
    const at = list.rva + 4 + i * MODULE_SIZE;
    const base = r.u64(at);
    const size = r.u32(at + 8);
    const nameRva = r.u32(at + 20);
    if (base === undefined || size === undefined || nameRva === undefined) break;
    const length = r.u32(nameRva);
    const chars = length !== undefined && length <= 2048 ? r.bytes(nameRva + 4, length) : undefined;
    // VS_FIXEDFILEINFO (at + 24): the file's version in two pairs of 16 bits
    const ms = r.u32(at + 24 + 8) ?? 0;
    const ls = r.u32(at + 24 + 12) ?? 0;
    modules.push({
      base,
      end: base + BigInt(size),
      name: chars ? baseName(chars.toString('utf16le')) : '?',
      version: ms || ls ? `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}` : undefined,
      cv: { size: r.u32(at + 76), rva: r.u32(at + 80) },
    });
  }
  const used = new Map();
  /** "module+0xoffset" of an address in a module, null of one in none. */
  const place = (value) => {
    const m = modules.find((mod) => value >= mod.base && value < mod.end);
    if (!m) return null;
    used.set(m.name, m);
    return `${m.name}+${hex(value - m.base)}`;
  };

  const at = place(address) ?? hex(address);
  const flags = contextSize !== undefined && contextSize >= CONTEXT_X64.size ? r.u32(contextRva + CONTEXT_X64.flags) : undefined;
  const x64 = flags !== undefined && (flags & CONTEXT_X64.amd64) !== 0;
  const rip = x64 ? r.u64(contextRva + CONTEXT_X64.rip) : undefined;
  const ip = rip === undefined ? undefined : (place(rip) ?? hex(rip));
  const frames = [];
  const threads = streams.get(THREAD_LIST);
  const threadCount = threads ? Math.min(r.u32(threads.rva) ?? 0, 4096) : 0;
  for (let i = 0; i < threadCount && x64; i++) {
    const t = threads.rva + 4 + i * THREAD_SIZE;
    if (r.u32(t) !== thread) continue;
    const start = r.u64(t + 24);
    const size = r.u32(t + 32);
    const rva = r.u32(t + 36);
    const rsp = r.u64(contextRva + CONTEXT_X64.rsp);
    if (start === undefined || size === undefined || rva === undefined || rsp === undefined) break;
    // from the stack pointer up while it lies in what the dump kept of the stack, else from where that starts
    const from = rsp >= start && rsp < start + BigInt(size) ? Number(rsp - start) & ~7 : 0;
    for (let slot = 0; slot < STACK_SLOTS && frames.length < FRAMES; slot++) {
      const offset = from + slot * 8;
      if (offset + 8 > size) break;
      const value = r.u64(rva + offset);
      if (value === undefined) break;
      const where = place(value);
      if (where && where !== frames[frames.length - 1] && where !== at && where !== ip) frames.push(where);
    }
    break;
  }

  return {
    code: hex(code).toUpperCase().replace('0X', '0x'),
    thread,
    at,
    ip: ip !== undefined && ip !== at ? ip : undefined,
    frames,
    modules: [...used.values()].slice(0, MODULES).map((m) => {
      // the CodeView record: "RSDS", a GUID, an age and the name of the symbol file
      const cv = m.cv.size !== undefined && m.cv.size >= 24 && r.u32(m.cv.rva) === 0x53445352 ? m.cv : null;
      let id;
      let pdb;
      const g = cv ? r.bytes(cv.rva + 4, 16) : undefined;
      const age = cv ? r.u32(cv.rva + 20) : undefined;
      if (g && age !== undefined) {
        const part = (bytes) => Buffer.from(bytes).reverse().toString('hex');
        id = `${part(g.subarray(0, 4))}${part(g.subarray(4, 6))}${part(g.subarray(6, 8))}${g.subarray(8).toString('hex')}${age.toString(16)}`.toUpperCase();
        const name = r.bytes(cv.rva + 24, Math.min(cv.size - 24, 260));
        if (name) pdb = baseName(name.toString('utf8').replace(/\0.*$/s, '')) || undefined;
      }
      return { name: m.name, version: m.version, id, pdb };
    }),
  };
}

module.exports = { MAX_DUMP_BYTES, dumpSummary };
