from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

downloads = Path.home() / "Downloads"
output = Path("test-results/screenshots")
names = ["01-dashboard", "02-novi-posao", "03-nesting", "04-kalkulacija", "05-proizvodnja"]
for index, name in enumerate(names, 1):
    reference, = downloads.glob(f"*09_57_*-{index}.png")
    pair = [Image.open(reference), Image.open(output / "1448x1086" / (name + ".png"))]
    pair = [ImageOps.contain(image.convert("RGB"), (900, 675)) for image in pair]
    canvas = Image.new("RGB", (1800, 705), "#172534")
    draw = ImageDraw.Draw(canvas)
    for position, (label, image) in enumerate(zip(["Referenca", "CNC CUT PRO"], pair)):
        draw.text((900 * position + 10, 8), label, fill="white")
        canvas.paste(image, (900 * position, 30))
    canvas.save(output / (name + "-poredjenje.jpg"), quality=90)

