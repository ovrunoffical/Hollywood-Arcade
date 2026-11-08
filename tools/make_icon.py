#!/usr/bin/env python3
"""Rebuilds the Windows icon (rsrc_windows_amd64.syso, web/favicon.ico) from web/logo.png.

Run from the repository root after changing the logo:  python3 tools/make_icon.py
Needs Pillow. `go build` picks the .syso up automatically, so the exe gets the new icon.
"""
import io, struct
from PIL import Image

SIZES = [16, 24, 32, 48, 64, 128, 256]
src = Image.open('web/logo.png').convert('RGBA')
pngs = []
for s in SIZES:
    b = io.BytesIO(); src.resize((s, s), Image.LANCZOS).save(b, 'PNG', optimize=True); pngs.append(b.getvalue())

# ---- favicon.ico (PNG-compressed entries)
ico = struct.pack('<HHH', 0, 1, len(SIZES)); off = 6 + 16 * len(SIZES); body = b''
for s, p in zip(SIZES, pngs):
    ico += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(p), off + len(body)); body += p
open('web/favicon.ico', 'wb').write(ico + body)

# ---- COFF object with an RT_ICON per size and one RT_GROUP_ICON
group = struct.pack('<HHH', 0, 1, len(SIZES))
for i, (s, p) in enumerate(zip(SIZES, pngs)):
    group += struct.pack('<BBBBHHIH', s % 256, s % 256, 0, 0, 1, 32, len(p), i + 1)
res = [(3, i + 1, p) for i, p in enumerate(pngs)] + [(14, 1, group)]   # (type, id, data)
types = sorted({t for t, _, _ in res})

def dir_hdr(n): return struct.pack('<IIHHHH', 0, 0, 0, 0, 0, n)
# offsets
root_sz = 16 + 8 * len(types)
cur = root_sz; type_off = {}
for t in types:
    type_off[t] = cur; cur += 16 + 8 * sum(1 for x in res if x[0] == t)
name_off = {}
for t, i, _ in res:
    name_off[(t, i)] = cur; cur += 24   # one directory per resource id holding a single language entry (1033)
data_ent = {}
for t, i, _ in res: data_ent[(t, i)] = cur; cur += 16
blob_off = {}
for t, i, d in res:
    cur = (cur + 7) & ~7; blob_off[(t, i)] = cur; cur += len(d)
sec = bytearray(cur)
def put(o, b): sec[o:o + len(b)] = b
put(0, dir_hdr(len(types)))
for k, t in enumerate(types): put(16 + 8 * k, struct.pack('<II', t, 0x80000000 | type_off[t]))
for t in types:
    ids = [i for tt, i, _ in res if tt == t]
    put(type_off[t], dir_hdr(len(ids)))
    for k, i in enumerate(ids): put(type_off[t] + 16 + 8 * k, struct.pack('<II', i, 0x80000000 | name_off[(t, i)]))
relocs = []
for t, i, d in res:
    put(name_off[(t, i)], dir_hdr(1)); put(name_off[(t, i)] + 16, struct.pack('<II', 1033, data_ent[(t, i)]))
    put(data_ent[(t, i)], struct.pack('<IIII', blob_off[(t, i)], len(d), 0, 0)); put(blob_off[(t, i)], d)
    relocs.append(data_ent[(t, i)])
raw = bytes(sec)
rel = b''.join(struct.pack('<IIH', r, 0, 3) for r in relocs)   # IMAGE_REL_AMD64_ADDR32NB against the .rsrc symbol
raw_ptr = 20 + 40; rel_ptr = raw_ptr + len(raw); sym_ptr = rel_ptr + len(rel)
hdr = struct.pack('<HHIIIHH', 0x8664, 1, 0, sym_ptr, 1, 0, 0)
sh = struct.pack('<8sIIIIIIHHI', b'.rsrc', 0, 0, len(raw), raw_ptr, rel_ptr, 0, len(relocs), 0, 0x40000040)
sym = struct.pack('<8sIhHBB', b'.rsrc', 0, 1, 0, 3, 0)
open('rsrc_windows_amd64.syso', 'wb').write(hdr + sh + raw + rel + sym + struct.pack('<I', 4))
print('wrote rsrc_windows_amd64.syso and web/favicon.ico')
