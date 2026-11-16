"""Names for the places a crash dump's summary gives (graphics.log's crash-dump and crash-stack lines).

    curl -s https://symbols.electronjs.org/<pdb>/<id>/<sym> | python scripts/crash_symbols.py - 0x81ff4c0 0x3a4f21c ...
    python scripts/crash_symbols.py electron.exe.sym "Generative Rhythm.exe+0x81ff4c0,Generative Rhythm.exe+0x3a4f21c"

When a process of the desktop app crashes, graphics.log says where as "module+0xoffset" (desktop/crashDump.js):
the instruction it stopped at and the return addresses on its stack. For the app's own executable (Electron's,
renamed) the names are in the symbol file Electron publishes for that very build: the crash-module line gives its
`pdb` (electron.exe.pdb) and `id`, and the file is at
    https://symbols.electronjs.org/<pdb>/<id>/<pdb without .pdb>.sym
(a Breakpad symbol file, a few hundred MB: read here as it comes, never kept whole). Each offset is answered with
the function it lies in, how far into it, and the source file and line. Offsets may be given bare or as they stand
in the log ("module+0x..", comma-separated: the module's name is dropped, so give one module's at a time).
"""

from __future__ import annotations

import bisect
import sys


def offsets_of(args: list[str]) -> list[int]:
    found = []
    for arg in args:
        for part in arg.split(","):
            part = part.strip()
            if not part:
                continue
            found.append(int(part.rsplit("+", 1)[-1], 16))
    return found


def symbolize(lines, offsets: list[int]) -> dict[int, dict]:
    """The function (and file and line) of each offset, from the lines of a Breakpad symbol file."""
    wanted = sorted(set(offsets))
    files: dict[int, str] = {}
    answers: dict[int, dict] = {}
    #: the nearest public symbol at or under each offset, for one in no function record
    public: dict[int, tuple[int, str]] = {}
    inside: list[int] = []
    for raw in lines:
        line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
        head = line[:1]
        if head == "F":
            if line.startswith("FILE "):
                _, number, name = line.rstrip("\r\n").split(" ", 2)
                files[int(number)] = name
                continue
            if line.startswith("FUNC "):
                parts = line.rstrip("\r\n").split(" ")
                at = 2 if parts[1] == "m" else 1
                start, size = int(parts[at], 16), int(parts[at + 1], 16)
                lo = bisect.bisect_left(wanted, start)
                inside = [o for o in wanted[lo:bisect.bisect_left(wanted, start + size)]]
                for o in inside:
                    answers[o] = {"function": " ".join(parts[at + 3:]), "into": o - start}
                continue
            inside = []
        elif head == "P" and line.startswith("PUBLIC "):
            inside = []
            parts = line.rstrip("\r\n").split(" ")
            at = 2 if parts[1] == "m" else 1
            start = int(parts[at], 16)
            for o in wanted[bisect.bisect_left(wanted, start):]:
                if o not in public or public[o][0] < start:
                    public[o] = (start, " ".join(parts[at + 2:]))
                else:
                    break
        elif head == "S" or head == "M" or head == "I":
            inside = []
        elif inside:
            # a line record of the function above: address size line file
            parts = line.split(" ")
            if len(parts) >= 4:
                try:
                    start, size = int(parts[0], 16), int(parts[1], 16)
                except ValueError:
                    continue
                for o in inside:
                    if start <= o < start + size:
                        answers[o]["line"] = int(parts[2])
                        answers[o]["file"] = int(parts[3])
    for o in wanted:
        if o in answers:
            number = answers[o].pop("file", None)
            if number is not None:
                answers[o]["file"] = files.get(number, f"file {number}")
        elif o in public:
            answers[o] = {"function": public[o][1], "into": o - public[o][0], "public": True}
    return answers


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    offsets = offsets_of(sys.argv[2:])
    source = sys.stdin.buffer if sys.argv[1] == "-" else open(sys.argv[1], "rb")
    answers = symbolize(source, offsets)
    for o in offsets:
        a = answers.get(o)
        if not a:
            print(f"+{o:#x}  ?")
            continue
        where = f"  {a['file']}:{a['line']}" if "line" in a else ""
        # (a public symbol has no size: the nearest one under the offset, which may not be the function it lies in)
        near = "  (nearest public symbol)" if a.get("public") else ""
        print(f"+{o:#x}  {a['function']} +{a['into']:#x}{where}{near}")


if __name__ == "__main__":
    main()
