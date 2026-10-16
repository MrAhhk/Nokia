"""Offline polished metal rim colorways; nine-slice geometry matches the shell.
No runtime shading, filters or blend modes. Black chrome is the default.
"""
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root / 'src/assets/hardware'
y, x = np.mgrid[:768, :768].astype(float)
qx, qy = np.abs(x - 383.5) - 192, np.abs(y - 383.5) - 192
d = -(np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - 192)
t = np.clip(d / 60, 0, 1)
height = 10 * np.sin(t * np.pi)
dy, dx = np.gradient(height)
n = np.stack((-dx, -dy, np.ones_like(d)), -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
spec = np.zeros_like(d)
for direction, strength, sharpness in [((-1, -1, 1.2), .65, 120), ((1, .1, .55), .35, 180), ((.1, 1, 1), .16, 70)]:
    light = np.array(direction); light /= np.linalg.norm(light)
    half = light + np.array([0, 0, 1]); half /= np.linalg.norm(half)
    spec += strength * np.maximum(np.sum(n * half, axis=-1), 0) ** sharpness
edge = .20 * np.exp(-((t - .13) / .028) ** 2) + .09 * np.exp(-((t - .88) / .024) ** 2)
alpha = np.uint8(np.minimum(np.clip(d, 0, 1), np.clip(60-d, 0, 1)) * 255)
palette = {'black': (12, 14, 16), 'red': (92, 16, 20), 'orange': (132, 57, 12),
           'yellow': (136, 109, 22), 'green': (16, 72, 35), 'blue': (15, 48, 103),
           'indigo': (32, 24, 75), 'violet': (76, 25, 91), 'white': (152, 157, 161)}
css = ['/* Offline polished-metal material, shared by all nine saved color choices. */']
for name, base in palette.items():
    rgb = np.array(base)[None,None,:] * (.45 + .55 * np.sin(t * np.pi))[...,None]
    rgb += (spec + edge)[...,None] * np.array([220, 224, 228])
    Image.fromarray(np.dstack((np.uint8(np.clip(rgb,0,255)),alpha))).save(out / f'metal-rim-{name}.webp', 'WEBP', lossless=True, method=6)
    dark = '#%02x%02x%02x' % base
    mid = '#%02x%02x%02x' % tuple(min(255, int(c * .7 + 48)) for c in base)
    selector = '.nokia-launcher' if name == 'black' else f'.nokia-launcher[data-keyboard-color="{name}"]'
    css.append(f'{selector} {{ --metal-rim: url("../../assets/hardware/metal-rim-{name}.webp"); --metal-dark: {dark}; --metal-mid: {mid}; }}')
(root / 'src/features/customization/polishedMetal.css').write_text('\n'.join(css), encoding='utf-8')
print('Baked nine polished metal rims.')
