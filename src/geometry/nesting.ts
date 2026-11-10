import { bounds, edges, EPS, inside, rotate, segmentDistance, segmentsIntersect, signedArea, translate, type Point, type Ring, type Shape } from './polygon';

export type Part = { id: string; name: string; quantity: number; shape: Shape };
export type Stock = { id?: string; width: number; height: number; outline?: Ring };
export type NestSettings = {
  width: number; height: number; margin: number; gap: number; angles: number[];
  seconds: number; material: string; thickness: number; source: 'new' | 'remnant' | 'mixed'; remnants: Stock[];
};
export type Placement = {
  id: string; partId: string; x: number; y: number; angle: number; locked?: boolean;
  rings: Ring[]; depths: number[]; width: number; height: number; area: number; length: number;
};
export type Sheet = Stock & { placements: Placement[] };
export type NestResult = { settings: NestSettings; sheets: Sheet[]; unplaced: string[]; attempts: number };

export function placement(part: Part, id: string, angle: number, x = 0, y = 0): Placement {
  const rings = rotate(part.shape.rings, angle);
  const box = bounds(rings);
  return { id, partId: part.id, x, y, angle, rings, depths: part.shape.depths,
    width: box.width, height: box.height, area: part.shape.area, length: part.shape.length };
}

const outer = (part: Placement) => translate(part.rings.filter((_, i) => part.depths[i] === 0), part.x, part.y);
export function conflicts(a: Placement, b: Placement, gap: number) {
  const slack = gap > EPS ? EPS : -EPS;
  if (a.x + a.width + gap < b.x + slack || b.x + b.width + gap < a.x + slack ||
      a.y + a.height + gap < b.y + slack || b.y + b.height + gap < a.y + slack) return false;
  const secondOutlines = outer(b).map(ring => ({ ring, segments: edges(ring) }));
  return outer(a).some(first => {
    const firstEdges = edges(first);
    return secondOutlines.some(({ring, segments}) =>
      inside(first[0], ring) || inside(ring[0], first) ||
      firstEdges.some(([p, q]) => segments.some(([r, s]) =>
        gap > EPS ? segmentDistance(p, q, r, s) < gap - EPS : segmentsIntersect(p, q, r, s))));
  });
}

export function fits(p: Placement, sheet: Sheet, settings: Pick<NestSettings, 'margin' | 'gap' | 'angles'>) {
  const m = settings.margin;
  if (![p.x, p.y, p.angle].every(Number.isFinite) || !settings.angles.includes(p.angle)) return false;
  if (p.x < m - EPS || p.y < m - EPS || p.x + p.width > sheet.width - m + EPS || p.y + p.height > sheet.height - m + EPS) return false;
  const outline = sheet.outline;
  if (outline && outer(p).some(ring =>
    ring.some(point => !inside(point, outline)) || edges(ring).some(([a, b]) =>
      edges(outline).some(([c, d]) => segmentDistance(a, b, c, d) < Math.max(EPS, m - EPS))))) return false;
  return !sheet.placements.some(other => other.id !== p.id && conflicts(p, other, settings.gap));
}

export function sheetStats(sheets: Sheet[]) {
  const total = sheets.reduce((sum, sheet) => sum + (sheet.outline ? Math.abs(signedArea(sheet.outline)) : sheet.width * sheet.height), 0);
  const parts = sheets.flatMap(sheet => sheet.placements);
  const area = parts.reduce((sum, part) => sum + part.area, 0);
  return { total, area, waste: Math.max(0, total - area), yield: total ? area / total * 100 : 0,
    count: parts.length, length: parts.reduce((sum, part) => sum + part.length, 0),
    pierces: parts.reduce((sum, part) => sum + part.rings.length, 0) };
}

function candidates(p: Placement, sheet: Sheet, margin: number, gap: number, pass: number) {
  const clearance = Math.max(gap, .001);
  const xValues = new Set([margin, sheet.width - margin - p.width]);
  const yValues = new Set([margin, sheet.height - margin - p.height]);
  const points: Point[] = [];
  const free = outer(p).flat();
  for (const other of sheet.placements) {
    xValues.add(other.x); xValues.add(other.x + other.width + clearance); xValues.add(other.x - p.width - clearance);
    yValues.add(other.y); yValues.add(other.y + other.height + clearance); yValues.add(other.y - p.height - clearance);
    const fixed = outer(other).flat();
    // Sample exterior vertices for placements whose bounding rectangles overlap.
    for (let i = 0; i < fixed.length; i += Math.ceil(fixed.length / 12)) {
      for (let j = 0; j < free.length; j += Math.ceil(free.length / 12)) {
        const x = fixed[i].x - free[j].x, y = fixed[i].y - free[j].y;
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
          if (dx || dy) points.push({ x: x + dx * clearance, y: y + dy * clearance });
        }
      }
    }
  }
  if (sheet.outline) {
    const step = Math.max(3, Math.min(p.width, p.height) / 5, Math.max(sheet.width, sheet.height) / 45);
    for (let y = margin + .001; y < sheet.height - margin; y += step)
      for (let x = margin + .001; x < sheet.width - margin; x += step) points.push({ x, y });
  }
  const xs = [...xValues].sort((a, b) => a - b).slice(0, 55), ys = [...yValues].sort((a, b) => a - b).slice(0, 55);
  for (const y of ys) for (const x of xs) points.push({ x, y });
  return points.filter(({ x, y }) => x >= margin - EPS && y >= margin - EPS &&
    x + p.width <= sheet.width - margin + EPS && y + p.height <= sheet.height - margin + EPS)
    .sort((a, b) => pass % 2 ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x);
}

function findPosition(variants: Placement[], sheet: Sheet, settings: NestSettings, pass: number, deadline: number) {
  let best: Placement | undefined;
  let score = Infinity;
  for (const variant of variants) {
    const points = candidates(variant, sheet, settings.margin, settings.gap, pass);
    const visited = new Set<string>();
    for (const [index, point] of points.entries()) {
      if (index % 16 === 0 && performance.now() >= deadline) return best;
      const key = point.x.toFixed(7) + ':' + point.y.toFixed(7);
      if (visited.has(key)) continue;
      visited.add(key);
      const proposed = { ...variant, ...point };
      if (!fits(proposed, sheet, settings)) continue;
      const value = pass % 2 ? proposed.x * sheet.height + proposed.y : proposed.y * sheet.width + proposed.x;
      if (value < score) { best = proposed; score = value; }
      break;
    }
  }
  return best;
}

export function optimize(parts: Part[], settings: NestSettings, previous?: NestResult, maxAttempts = 6): NestResult {
  if (![settings.width, settings.height, settings.gap, settings.margin, settings.seconds].every(Number.isFinite) ||
      settings.width <= 0 || settings.height <= 0 || settings.gap < 0 || settings.margin < 0 ||
      !settings.angles.length || !settings.angles.every(Number.isFinite) || settings.seconds <= 0)
    throw new Error('Proverite dimenzije, razmak, marginu i dozvoljene uglove.');
  const count = parts.reduce((sum, part) => sum + part.quantity, 0);
  if (!Number.isInteger(count) || count < 1 || count > 500 || parts.some(p => !Number.isInteger(p.quantity) || p.quantity < 1 || !p.shape.rings.length))
    throw new Error('Izaberite od 1 do 500 validnih delova.');
  const deadline = performance.now() + settings.seconds * 1000;
  const items = parts.flatMap(part => {
    const variants = settings.angles.map(angle => placement(part, '', angle));
    return Array.from({ length: part.quantity }, (_, i) => ({
      part, id: part.id + ':' + i, variants,
    }));
  });
  const itemIds = new Set(items.map(item => item.id));
  const lockedSheets = previous?.sheets.filter(sheet => sheet.placements.some(p => p.locked)).map(sheet => {
    const stock = sheet.id ? settings.remnants.find(remnant => remnant.id === sheet.id) : { width: settings.width, height: settings.height };
    if (!stock || (sheet.id && settings.source === 'new') || (!sheet.id && settings.source === 'remnant'))
      throw new Error('Otključajte delove pre promene izvora tabli.');
    const placements = sheet.placements.filter(p => p.locked);
    const next = { ...stock, placements };
    if (placements.some(p => !itemIds.has(p.id) || !fits(p, next, settings)))
      throw new Error('Zaključani delovi krše nova podešavanja.');
    return next;
  }) ?? [];
  const locked = new Set(lockedSheets.flatMap(sheet => sheet.placements.map(p => p.id)));
  let best: NestResult | undefined;
  let attempts = 0;
  for (let pass = 0; pass < maxAttempts && performance.now() < deadline; pass++) {
    const sheets: Sheet[] = lockedSheets.map(sheet => ({ ...sheet, placements: [...sheet.placements] }));
    const remnants = settings.source === 'new' ? [] : settings.remnants.filter(stock => !sheets.some(sheet => sheet.id === stock.id));
    const order = [...items].filter(item => !locked.has(item.id)).sort((a, b) => {
      const rank = (part: Part) => [part.shape.area, part.shape.width * part.shape.height, Math.max(part.shape.width, part.shape.height)][Math.floor(pass / 2) % 3];
      return rank(b.part) - rank(a.part) || a.id.localeCompare(b.id);
    });
    const unplaced: string[] = [];
    for (const item of order) {
      const variants = item.variants.map(p => ({ ...p, id: item.id }));
      let added = false;
      for (const sheet of sheets) {
        const position = findPosition(variants, sheet, settings, pass, deadline);
        if (position) { sheet.placements.push(position); added = true; break; }
      }
      if (added) continue;
      const stockChoices = [...remnants];
      if (settings.source !== 'remnant') stockChoices.push({ width: settings.width, height: settings.height });
      for (const stock of stockChoices) {
        const sheet: Sheet = { ...stock, placements: [] };
        const position = findPosition(variants, sheet, settings, pass, deadline);
        if (!position) continue;
        sheet.placements.push(position);
        sheets.push(sheet);
        if (stock.id) remnants.splice(remnants.indexOf(stock), 1);
        added = true;
        break;
      }
      if (!added) unplaced.push(item.id);
    }
    attempts++;
    const waste = sheetStats(sheets).waste;
    if (!best || unplaced.length < best.unplaced.length || (unplaced.length === best.unplaced.length &&
      (sheets.length < best.sheets.length || (sheets.length === best.sheets.length && waste < sheetStats(best.sheets).waste)))) {
      best = { settings, sheets, unplaced, attempts };
    }
  }
  return { ...(best ?? { settings, sheets: lockedSheets, unplaced: items.filter(i => !locked.has(i.id)).map(i => i.id) }), attempts };
}

