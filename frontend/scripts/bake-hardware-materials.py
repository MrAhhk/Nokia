"""Offline orthographic material bake. No rendering code runs on the phone.

Rounded solid height fields supply bevel normals; a GGX microfacet BRDF,
Schlick Fresnel and sampled studio area lights supply the baked reflections.
Deterministic micro-normal grain keeps the surfaces from looking airbrushed.
Run with Python + numpy + Pillow. Outputs only the named material assets.
"""
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'src/assets/hardware'
OUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(1280)


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-7)


def rounded_distance(w, h, radius):
    y, x = np.mgrid[:h, :w].astype(float)
    qx = np.abs(x - (w - 1) / 2) - (w / 2 - radius)
    qy = np.abs(y - (h - 1) / 2) - (h / 2 - radius)
    return -(np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
             + np.minimum(np.maximum(qx, qy), 0) - radius)


def shade(height, base, metallic, roughness, brushed=False):
    h, w = height.shape
    dy, dx = np.gradient(height)
    grain = RNG.normal(0, .009, (h, w))
    if brushed:
        grain += RNG.normal(0, .017, (h, 1))
    normal = unit(np.stack((-dx + grain * .3, -dy + grain, np.ones_like(dx)), -1))
    view = np.array([0., 0., 1.])
    nv = np.maximum(normal[..., 2:3], .001)
    albedo = np.array(base)[None, None, :]
    f0 = .04 * (1 - metallic) + albedo * metallic
    rgb = np.broadcast_to(albedo * .42, (h, w, 3)).copy()
    # Broad upper-left softbox, narrow cooler right rim, low fill.
    lights = [((-0.6, -0.8, 1.5), (2.1, 2.08, 2.0), .35),
              ((1.2, .15, .65), (.95, 1.0, 1.02), .16),
              ((-.1, 1.2, 1.0), (.25, .26, .25), .3)]
    a2 = roughness ** 4
    k = (roughness + 1) ** 2 / 8
    for direction, energy, spread in lights:
        for ox, oy in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
            light = unit(np.array(direction) + np.array([ox, oy, 0]) * spread)
            half = unit(light + view)
            nl = np.maximum(np.sum(normal * light, -1, keepdims=True), 0)
            nh = np.maximum(np.sum(normal * half, -1, keepdims=True), 0)
            vh = max(float(half[2]), 0)
            distribution = a2 / (np.pi * (nh * nh * (a2 - 1) + 1) ** 2)
            geometry = nv / (nv * (1 - k) + k) * nl / (nl * (1 - k) + k)
            fresnel = f0 + (1 - f0) * (1 - vh) ** 5
            specular = distribution * geometry * fresnel / np.maximum(4 * nv * nl, .001)
            diffuse = (1 - fresnel) * (1 - metallic) * albedo / np.pi
            rgb += (diffuse + specular) * nl * np.array(energy) / 4
    rgb *= 1 + RNG.normal(0, .008, (h, w, 1))
    # Exposure and sRGB conversion, preserving the existing charcoal palette.
    rgb = np.clip(rgb, 0, 1)
    return np.uint8(np.clip(np.where(rgb <= .0031308, rgb * 12.92,
                                    1.055 * rgb ** (1 / 2.4) - .055) * 255, 0, 255))


def save(name, rgb, alpha=None):
    if alpha is not None:
        rgb = np.dstack((rgb, np.uint8(np.clip(alpha, 0, 1) * 255)))
    image = Image.fromarray(rgb)
    image.save(OUT / name, format='WEBP', lossless=True, method=6)
    print(name, image.size, (OUT / name).stat().st_size)


# Square source is nine-sliced: corner radius and the 12px rim stay proportional.
d = rounded_distance(768, 768, 192)
t = np.clip(d / 60, 0, 1)
height = 12 * np.sin(t * np.pi) ** .7
rgb = shade(height, (.065, .07, .067), .88, .3, brushed=True)
occlusion = .5 + .5 * np.minimum(np.clip(d / 4, 0, 1), np.clip((60 - d) / 7, 0, 1))
rgb = np.uint8(rgb * occlusion[..., None])
save('anodized-rim.webp', rgb, np.minimum(np.clip(d, 0, 1), np.clip(60 - d, 0, 1)))

# A shallow domed key with a rounded upper bevel and recessed skirt.
d = rounded_distance(768, 384, 20)
t = np.clip(d / 22, 0, 1)
y, x = np.mgrid[:384, :768]
height = 9 * np.sin(t * np.pi / 2) + 1.3 * np.sin(x / 768 * np.pi) * np.sin(y / 384 * np.pi)
rgb = shade(height, (.017, .019, .019), .08, .39)
rgb = np.uint8(rgb * (.48 + .52 * np.clip(d / 6, 0, 1))[..., None])
save('matte-keycap.webp', rgb, np.clip(d, 0, 1))
