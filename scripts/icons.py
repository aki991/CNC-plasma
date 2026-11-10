from pathlib import Path
from PIL import Image, ImageDraw
import math

for size, name in [(192, "icon-192"), (512, "icon-512"), (512, "icon-maskable")]:
    image = Image.new("RGB", (size, size), "#16232f")
    draw = ImageDraw.Draw(image)
    c = size / 2
    radius = size * .29
    points = []
    for i in range(8):
        for phase, multiplier in [(0, .79), (.18, 1), (.54, 1), (.72, .79)]:
            angle = (i + phase) * math.tau / 8
            points.append((c + radius * multiplier * math.cos(angle), c + radius * multiplier * math.sin(angle)))
    draw.polygon(points, fill="#d5dfed")
    draw.ellipse((c-radius*.49, c-radius*.49, c+radius*.49, c+radius*.49), fill="#16232f")
    draw.rectangle((c, c-radius*.15, c+radius*1.04, c+radius*.15), fill="#16232f")
    draw.ellipse((c-radius*.16, c-radius*.16, c+radius*.16, c+radius*.16), fill="#187cff")
    image.save(Path("public") / (name + ".png"))

