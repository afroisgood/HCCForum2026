"""源泉圓體 TW 網頁字型切片

把 6～7 MB 的完整字型切成三層，讓瀏覽器只下載需要的部分：
  1. core   ：網頁本身用到的字 + ASCII／標點（每個頁面一定會載入，約 100 KB）
  2. common ：Big5 常用字（5401 字）扣掉 core（有人打字或顯示提問時才載入，約 1.2 MB）
  3. rare-NN：其餘字元，依碼位切片（遇到罕用字才載入）

用法（需要 pip install fonttools brotli）：
  python3 tools/build-fonts.py <GenSenRounded2TW-R.woff2> <GenSenRounded2TW-B.woff2>
字型來源：https://github.com/ButTaiwan/gensen-font （SIL OFL 1.1）
"""
import pathlib
import subprocess
import sys

from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'fonts'
CSS = ROOT / 'assets' / 'css' / 'fonts.css'
RARE_SLICE = 1500  # 每個罕用字切片的字數

WEIGHTS = {'R': 400, 'B': 700}


def page_chars():
    chars = set()
    for f in [*ROOT.glob('*.html'), *(ROOT / 'assets' / 'js').glob('*.js')]:
        chars |= {ord(c) for c in f.read_text(encoding='utf-8') if ord(c) > 0x7f}
    return chars


def big5_level1():
    cps = set()
    for hi in range(0xA4, 0xC7):
        for lo in [*range(0x40, 0x7F), *range(0xA1, 0xFF)]:
            b = bytes([hi, lo])
            if b > b'\xc6\x7e':
                continue
            try:
                c = b.decode('big5')
            except UnicodeDecodeError:
                continue
            if len(c) == 1:
                cps.add(ord(c))
    return cps


def ranges(cps):
    cps = sorted(cps)
    out, start, prev = [], cps[0], cps[0]
    for c in cps[1:]:
        if c != prev + 1:
            out.append((start, prev))
            start = c
        prev = c
    out.append((start, prev))
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in out)


def subset(src, cps, out):
    subprocess.run([
        'pyftsubset', str(src), '--unicodes=' + ','.join(f'{c:X}' for c in sorted(cps)),
        '--flavor=woff2', '--layout-features=*', '--no-hinting', f'--output-file={out}',
    ], check=True)


def main(src_r, src_b):
    srcs = {'R': pathlib.Path(src_r), 'B': pathlib.Path(src_b)}
    cmap = set(TTFont(srcs['R']).getBestCmap()) & set(TTFont(srcs['B']).getBestCmap())

    base = {*range(0x20, 0x7F), *range(0xA0, 0x100), *range(0x2000, 0x2070), *range(0x3000, 0x3040),
            *range(0xFF00, 0xFFF0), 0x2192, 0x25CF}
    core = (base | page_chars()) & cmap
    common = (big5_level1() & cmap) - core
    rest = sorted(cmap - core - common - set(range(0, 0x20)))
    rare = [rest[i:i + RARE_SLICE] for i in range(0, len(rest), RARE_SLICE)]

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.woff2'):
        old.unlink()

    families = []  # (family, unicode-range or None, file stem)
    families.append(('GenSen Core', None, 'core'))
    families.append(('GenSen Common', f'U+{min(common):X}-{max(common):X}', 'common'))
    for i, chunk in enumerate(rare):
        families.append((f'GenSen Rare {i:02d}', f'U+{chunk[0]:X}-{chunk[-1]:X}', f'rare-{i:02d}'))
    sets = {'core': core, 'common': common, **{f'rare-{i:02d}': set(c) for i, c in enumerate(rare)}}

    css = ['/* 源泉圓體 TW（GenSenRounded2 TW）— SIL OFL 1.1，見 assets/fonts/OFL.txt。',
           '   由 tools/build-fonts.py 產生，請勿手動修改。 */']
    for family, urange, stem in families:
        for w, weight in WEIGHTS.items():
            subset(srcs[w], sets[stem], OUT / f'{stem}-{w}.woff2')
            css.append('@font-face {')
            css.append(f"  font-family: '{family}';")
            css.append(f'  font-weight: {weight};')
            css.append('  font-display: swap;')
            css.append(f"  src: url('../fonts/{stem}-{w}.woff2') format('woff2');")
            if urange:
                css.append(f'  unicode-range: {urange};')
            css.append('}')
    stack = ', '.join(f"'{f}'" for f, _, _ in families)
    css.append(f":root {{ --font-gensen: {stack}; }}")
    CSS.write_text('\n'.join(css) + '\n', encoding='utf-8')

    total = sum(p.stat().st_size for p in OUT.glob('*.woff2'))
    print(f'core {len(core)} 字, common {len(common)} 字, rare {len(rare)} 片；共 {total / 1e6:.1f} MB')
    for p in sorted(OUT.glob('core-*.woff2')) + sorted(OUT.glob('common-*.woff2')):
        print(f'  {p.name}: {p.stat().st_size / 1e3:.0f} KB')


if __name__ == '__main__':
    main(*sys.argv[1:3])
