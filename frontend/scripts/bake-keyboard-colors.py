"""Offline colorways from the approved key's luminance relief; no runtime filters."""
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = np.asarray(Image.open(root / 'src/assets/hardware/heritage-keycap.webp').convert('RGBA'))
luma = source[..., :3].astype(float).mean(axis=2)
relief = np.clip(luma / 48, .12, 1.6)[..., None]
colors = {'red': (151, 34, 40), 'orange': (208, 111, 34), 'yellow': (216, 184, 47),
          'green': (43, 128, 70), 'blue': (38, 97, 168), 'indigo': (66, 58, 127),
          'violet': (133, 60, 154), 'white': (222, 224, 220)}
for name, base in colors.items():
    rgb = np.uint8(np.clip(relief * np.array(base), 0, 255))
    Image.fromarray(np.dstack((rgb, source[..., 3]))).save(root / f'src/assets/hardware/key-{name}.webp', 'WEBP', quality=90, method=6)

print('Historical raised-key assets only. Current satin palette is owned by keyboardColors.css.')
