# Draws the app icons and favicons from the pig bitmap, pixel for pixel, so
# every size is crisp. No dependencies: writes PNGs with zlib.
#   python3 scripts/icons.py
import struct, zlib

PIG = [
    '.##............................##.',
    '.##............................##.',
    '.##.....###.............##.....##.',
    '##################################',
    '.##....####............####....##.',
    '.##...####..............####...##.',
    '.##...###................###...##.',
    '......###................###......',
    '......###..############..###......',
    '......####.############.####......',
    '......#######.######.#######......',
    '......#######.######.#######......',
    '.......####################.......',
    '........##################........',
    '...........############...........',
    '...........############...........',
    '............#.#....#.#............',
    '............#.#....#.#............',
]
ACCENT = (0xd9, 0x83, 0x5f, 255)
INK = (0x12, 0x0c, 0x08, 255)
CLEAR = (0, 0, 0, 0)

def png(path, size, bg, fg, fill):
    """fill: share of the width the pig may span; the rest is margin."""
    cell = max(1, int(size * fill) // len(PIG[0]))
    w, h = len(PIG[0]) * cell, len(PIG) * cell
    x0, y0 = (size - w) // 2, (size - h) // 2
    rows = []
    for y in range(size):
        row = bytearray(b'\x00')
        for x in range(size):
            cx, cy = x - x0, y - y0
            on = 0 <= cx < w and 0 <= cy < h and PIG[cy // cell][cx // cell] == '#'
            row += bytes(fg if on else bg)
        rows.append(bytes(row))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))

# Home-screen icons: dark pig on the accent, inside the maskable safe zone.
png('src/images/icons/icon-512.png', 512, ACCENT, INK, 0.70)
png('src/images/icons/icon-192.png', 192, ACCENT, INK, 0.72)
png('src/images/favicon/apple-touch-icon.png', 180, ACCENT, INK, 0.76)
# Tab favicons: the pig alone, as big as it fits.
png('src/images/favicon/favicon-32x32.png', 32, CLEAR, ACCENT, 1.0)
png('src/images/favicon/favicon-16x16.png', 16, CLEAR, ACCENT, 1.0)

# One SVG for the header and modern browser tabs: sharp at any size.
rects = ''.join(f'<rect x="{x}" y="{y}" width="1" height="1"/>'
                for y, row in enumerate(PIG) for x, ch in enumerate(row) if ch == '#')
open('src/images/pig.svg', 'w').write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {len(PIG[0])} {len(PIG)}" '
    f'shape-rendering="crispEdges" fill="#d9835f">{rects}</svg>\n')
