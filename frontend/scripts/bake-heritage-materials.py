"""Bake the approved raised key with legacy grain, leather and ebony inlays.

Offline only; deterministic assets with no runtime filters or blend modes.
Run after bake-hardware-materials.py using Python, numpy and Pillow.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / 'src/assets'
OUT = ASSETS / 'hardware'
rng = np.random.default_rng(1281)


def save(name, values):
    image = Image.fromarray(np.uint8(np.clip(values, 0, 255)))
    image.save(OUT / name, 'WEBP', quality=92, method=6)
    print(name, image.size, (OUT / name).stat().st_size)


# Restore the actual previous theme's grain without losing the approved bevel.
key = np.asarray(Image.open(OUT / 'matte-keycap.webp').convert('RGBA')).copy()
old = np.asarray(Image.open(ASSETS / 'aged-phone-fabric.webp').convert('L')
                 .resize((768, 384)), dtype=float)
grain = np.clip((old - np.mean(old)) / max(np.std(old), 1), -2.5, 2.5)
key[..., :3] = np.uint8(np.clip(key[..., :3] * (1 + grain[..., None] * .16), 0, 255))
save('heritage-keycap.webp', key)

# Irregular pebbled leather: nearest-cell seams, softly rounded raised grains.
h, w = 1024, 768
y, x = np.mgrid[:h, :w].astype(float)
spacing = 11
cy, cx = np.floor(y / spacing).astype(int), np.floor(x / spacing).astype(int)
sites = rng.uniform(.15, .85, (h // spacing + 4, w // spacing + 4, 2))
nearest = np.full((h, w), np.inf)
second = nearest.copy()
for oy in (-1, 0, 1):
    for ox in (-1, 0, 1):
        jitter = sites[cy + oy + 1, cx + ox + 1]
        distance = np.hypot(x - (cx + ox + jitter[..., 0]) * spacing,
                            y - (cy + oy + jitter[..., 1]) * spacing)
        second = np.minimum(second, np.maximum(nearest, distance))
        nearest = np.minimum(nearest, distance)
relief = np.tanh((second - nearest) / 1.8)
dy, dx = np.gradient(relief)
light = -dx * 9 - dy * 12
falloff = 4 * np.exp(-((x / w - .25) ** 2 + (y / h - .1) ** 2) * 2)
leather = 19 + relief * 8 + light + falloff + rng.normal(0, .7, (h, w))
save('charcoal-leather.webp', leather[..., None] * np.array([1.0, 1.015, 1.0]))

# Quarter-sawn dark wood: irregular growth rings, open pores and satin relief.
# Taller source avoids tiling seams across a complete portrait handset.
h, w = 2048, 1024
y, x = np.mgrid[:h, :w].astype(float)
wood_rng = np.random.default_rng(1980)
warp = x + 19 * np.sin(y / 330 + x / 370) + 6 * np.sin(y / 117 + x / 210)
warp += 36 * np.exp(-((x - 630) / 180) ** 2) * np.sin(y / 520)
profile = wood_rng.normal(0, 1, 2048)
profile = np.convolve(profile, np.ones(5) / 5, mode='same')
growth = np.interp(warp.ravel(), np.arange(2048) - 300, profile).reshape(h, w)
fine = np.sin(warp * 1.7 + .8 * np.sin(y / 77))
pores = np.maximum(0, fine) ** 20
pores *= .5 + .5 * np.sin(y / 11 + warp / 9) ** 2
relief = growth * .65 - pores * .3
dy, dx = np.gradient(relief)
softbox = 7 * np.exp(-((x / w - .22) ** 2 * 3 + (y / h - .22) ** 2))
wood = 31 + growth * 15 - pores * 7 - dx * 3 - dy * 5 + softbox
wood += wood_rng.normal(0, .65, (h, w))
save('ebony-inlay.webp', wood[..., None] * np.array([1.14, 1.0, .82]))
