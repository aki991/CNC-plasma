import { rectangle } from '../data/catalog';
import type { Model } from '../data/types';
import { parseDxf, writeDxf } from '../geometry/dxf';
import { makeShape, type Ring, type Shape } from '../geometry/polygon';
import { fenceLayout, segmentName } from './layout';
import { hasRepeatableOpenings, repeatOpenings } from './repeat';
import type { FenceDesign, FenceProject, GeneratedFence, PanelChoice, PanelMode } from './types';
import { defaultVoronoi, newVoronoiSeed, voronoiPanel } from './voronoi';

const parametricPatterns = {
  'OG-001': 'vertical', 'OG-002': 'horizontal', 'OG-003': 'diamond', 'OG-006': 'round', 'OG-007': 'hex', 'OG-013': 'round',
} as const;
type Pattern = typeof parametricPatterns[keyof typeof parametricPatterns];
export const isParametric = (id: string) => Object.hasOwn(parametricPatterns, id);
export const isRepeatable = (model?: Model) => Boolean(model?.valid && hasRepeatableOpenings(model.shape));
export const dimension = (value: number) => Number(value.toFixed(3));
const FIT_TOLERANCE = .005;
const REPEAT_LAYOUT_VERSION = 'repeat-gap-fill-v2';
export const defaultOpening = (id: string) => ({ 'OG-002': 45, 'OG-003': 80, 'OG-006': 65, 'OG-007': 60, 'OG-013': 25 }[id] ?? 58);
export const minimumBridge = (thickness: number) => Math.max(12, thickness * 3);
export const minimumBorder = (thickness: number) => Math.max(22, thickness * 4);

export function newVoronoiChoice(): PanelChoice {
  return {modelId:'',mode:'voronoi',voronoi:{...defaultVoronoi,seed:newVoronoiSeed()}};
}

function parametricPanel(choice: PanelChoice, width: number, height: number, thickness: number) {
  const pattern = parametricPatterns[choice.modelId as keyof typeof parametricPatterns];
  if (!pattern) throw new Error('Izabrani motiv nema parametarska pravila.');
  const opening = choice.opening ?? defaultOpening(choice.modelId);
  const bridge = choice.bridge ?? minimumBridge(thickness);
  const border = choice.border ?? minimumBorder(thickness);
  if (opening < 4 || bridge < minimumBridge(thickness) || border < minimumBorder(thickness))
    throw new Error('Otvor mora imati najmanje 4 mm, a mostovi i obod moraju ispuniti zadate minimume za debljinu lima.');
  const innerW = width - 2 * border, innerH = height - 2 * border;
  const holeW = pattern === 'horizontal' ? innerW : opening;
  const holeH = pattern === 'vertical' ? innerH : opening;
  if (holeW < 4 || holeH < 4 || innerW < holeW || innerH < holeH)
    throw new Error('Nema mesta za motiv sa ovim otvorom i obodom.');
  // The reference infill packs a fixed opening and bridge period, then centers the remainder.
  const columns = Math.floor((innerW + bridge) / (holeW + bridge));
  const rows = Math.floor((innerH + bridge) / (holeH + bridge));
  const sides = pattern === 'round' ? 24 : pattern === 'hex' ? 6 : 4;
  if (columns * rows > 2499 || columns * rows * (sides + 1) > 34000)
    throw new Error('Previše otvora. Povećajte otvor ili razmak između otvora.');
  const startX = (width - columns * holeW - (columns - 1) * bridge) / 2;
  const startY = (height - rows * holeH - (rows - 1) * bridge) / 2;
  const rings = [rectangle(0, 0, width, height)];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = startX + col * (holeW + bridge), y = startY + row * (holeH + bridge);
    rings.push(pattern === 'horizontal' || pattern === 'vertical' ? rectangle(x, y, holeW, holeH) :
      Array.from({ length: sides }, (_, k) => ({
        x: x + holeW * (1 + Math.cos(k * 2 * Math.PI / sides)) / 2,
        y: y + holeH * (1 + Math.sin(k * 2 * Math.PI / sides)) / 2,
      })));
  }
  return makeShape(rings);
}

export type PanelPreview = { shape?: Shape; warning?: string; error?: string; name: string; mode: PanelMode };
function matchesSize(model: Model, width: number, height: number) {
  return Math.abs(model.shape.width - width) <= FIT_TOLERANCE && Math.abs(model.shape.height - height) <= FIT_TOLERANCE;
}
function effectiveMode(choice: PanelChoice, width: number, height: number, model?: Model): PanelMode {
  // Older projects stored the picker's default as "fixed". Adapt those choices when their dimensions differ.
  return choice.mode === 'fixed' && !choice.fixedSize && model && !matchesSize(model,width,height) && isRepeatable(model) ? 'repeat' : choice.mode;
}
export function panelGeometry(choice: PanelChoice, width: number, height: number, thickness: number, model?: Model): PanelPreview {
  const mode = effectiveMode(choice,width,height,model);
  const name = mode==='voronoi' ? 'Voronoi ispuna' : choice.modelId ? model?.name ?? 'DXF šablon' : 'Puni lim';
  try {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 10 || height < 10)
      throw new Error('Montažni zazori i ram moraju ostaviti najmanje 10 × 10 mm za lim.');
    if (mode==='voronoi') return { shape:voronoiPanel(width,height,choice.voronoi??defaultVoronoi),name,mode };
    if (!choice.modelId) return { shape: makeShape([rectangle(0, 0, width, height)]), name, mode };
    if (!model?.valid || !model.shape.rings.length) throw new Error('Izaberite dostupan, validan model iz DXF biblioteke.');
    if (mode === 'parametric') return { shape: parametricPanel(choice, width, height, thickness), name, mode };
    const shape = model.shape;
    if (mode === 'repeat') return {
      shape: repeatOpenings(shape, width, height, { border: minimumBorder(thickness), bridge: minimumBridge(thickness) }),
      name, mode,
    };
    if (shape.depths.filter(depth => depth === 0).length !== 1 || shape.depths.some(depth => depth > 1))
      throw new Error('Panel mora imati jednu spoljnu konturu bez odvojenih ostrva.');
    if (mode === 'fixed') {
      if (!matchesSize(model,width,height))
        throw new Error('Fiksni šablon je ' + dimension(shape.width) + ' × ' + dimension(shape.height) + ' mm. Za drugu meru izaberite ponavljanje otvora ili promenite dimenzije.');
      return { shape, name, mode };
    }
    const scale = Math.min(width / shape.width, height / shape.height);
    const scaled = makeShape(shape.rings.map(ring => ring.map(p => ({ x: p.x * scale, y: p.y * scale }))));
    return { shape: scaled, name, mode, warning: 'Skala ' + dimension(scale * 100) + ' %. Proverite širine otvora i metalnih mostova pre sečenja.' +
      (width - scaled.width > FIT_TOLERANCE || height - scaled.height > FIT_TOLERANCE ? ' Panel je centriran u otvoru, uz dodatni slobodan prostor.' : '') };
  } catch (error) {
    return { name, mode, error: error instanceof Error ? error.message : 'Geometrija panela nije validna.' };
  }
}

export function analyzeFence(design: FenceDesign, models: Model[]) {
  const layout = fenceLayout(design);
  const byId = new Map(models.map(model => [model.id, model]));
  const cached = new Map<string, PanelPreview>();
  const errors: string[] = [];
  const warnings: string[] = [];
  const spans = layout.spans.map(span => {
    const label = segmentName(span.segment, span.index);
    if (span.top > Math.min(layout.posts[span.index].height, layout.posts[span.index + 1].height))
      errors.push(label + ' · Vrh segmenta je viši od susednog stuba.');
    const leaves = span.leaves.map(leaf => {
      const cacheKey = JSON.stringify([leaf.choice, leaf.cutWidth, leaf.cutHeight]);
      const preview = cached.get(cacheKey) ?? panelGeometry(leaf.choice, leaf.cutWidth, leaf.cutHeight, design.thickness, byId.get(leaf.choice.modelId));
      cached.set(cacheKey, preview);
      const panel = span.plinthHeight > 0 && leaf.cutHeight < 10
        ? { ...preview, error: 'Smanjite visinu podnožja ili zazore. Za lim mora ostati najmanje 10 mm visine.' }
        : preview;
      const name = label + (span.leaves.length > 1 ? (leaf.leaf ? ' · desno krilo' : ' · levo krilo') : '');
      if (panel.error) errors.push(name + ' · ' + panel.error);
      if (panel.warning) warnings.push(name + ' · ' + panel.warning);
      return { ...leaf, panel, name };
    });
    return { ...span, leaves };
  });
  const leaves = spans.flatMap(span => span.leaves);
  const summary = {
    length: layout.length, height: layout.fenceHeight, postCount: layout.posts.length, segmentWidths: spans.map(span => span.width),
    panelCount: leaves.length, sheetPartCount: leaves.length,
    frameMeters: design.frame ? leaves.reduce((sum, leaf) => sum + 2 * (leaf.width + leaf.height) / 1000, 0) : 0,
    gateCount: spans.filter(span => span.segment.kind !== 'panel').length,
  };
  return { ...layout, spans, summary, errors, warnings };
}
export type FenceAnalysis = ReturnType<typeof analyzeFence>;

export function fenceKey(design: FenceDesign, models: Model[]) {
  const leaves = fenceLayout(design).spans.flatMap(span=>span.leaves);
  const ids = new Set(leaves.map(leaf=>leaf.choice.modelId));
  const sources = models.filter(model=>ids.has(model.id));
  const byId = new Map(sources.map(model=>[model.id,model]));
  const snapshot = [design, sources.map(model=>
    [model.id, model.name, model.valid, model.unit, model.shape.width, model.shape.height]).sort()];
  const repeats = leaves.some(leaf=>leaf.choice.modelId &&
    effectiveMode(leaf.choice,leaf.cutWidth,leaf.cutHeight,byId.get(leaf.choice.modelId)) === 'repeat');
  return JSON.stringify(repeats ? [...snapshot,REPEAT_LAYOUT_VERSION] : snapshot);
}

function contourKey(ring: Ring) {
  const tokens = ring.map(p => p.x.toFixed(7) + ',' + p.y.toFixed(7));
  const start = tokens.reduce((best, token, i) => token < tokens[best] ? i : best, 0);
  const rotated = [...tokens.slice(start), ...tokens.slice(0, start)];
  const forward = rotated.join('|'), backward = [rotated[0], ...rotated.slice(1).reverse()].join('|');
  return forward < backward ? forward : backward;
}

export function generateFence(project: FenceProject, models: Model[], approveScaling = false): GeneratedFence {
  const { design } = project;
  if (!design.name.trim()) throw new Error('Unesite naziv projekta.');
  if (!design.segments.length) throw new Error('Dodajte segment ili kapiju za generisanje DXF-a.');
  const analysis = analyzeFence(design, models);
  if (analysis.errors.length) throw new Error(analysis.errors[0]);
  if (analysis.warnings.length && !approveScaling) throw new Error('Potvrdite proporcionalno skaliranje pre generisanja.');
  const parts = new Map<string, Model>();
  const dimensions = analysis.spans.flatMap(span => span.leaves.map(leaf => {
    const shape = leaf.panel.shape!;
    const geometryKey = shape.rings.map(contourKey).sort().join(';');
    let part = parts.get(geometryKey);
    if (part) part.quantity++;
    else {
      const raw = writeDxf(shape.rings);
      const reimport = parseDxf(raw);
      if (!reimport.valid || reimport.shape.rings.length !== shape.rings.length ||
          Math.abs(reimport.shape.width - shape.width) > FIT_TOLERANCE ||
          Math.abs(reimport.shape.height - shape.height) > FIT_TOLERANCE ||
          reimport.shape.width > leaf.cutWidth + FIT_TOLERANCE || reimport.shape.height > leaf.cutHeight + FIT_TOLERANCE)
        throw new Error(leaf.name + ' · DXF provera kontura ili dimenzija nije prošla. ' + reimport.issues.join(' '));
      const index = parts.size + 1;
      const slug = design.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'ograda';
      part = {
        id: 'fence-' + project.id + '-' + index, filename: slug + '-panel-' + index + '.dxf',
        name: leaf.panel.name + ' · ' + dimension(shape.width) + ' × ' + dimension(shape.height),
        category: 'Projektovanje ograda', material: design.material, thickness: design.thickness,
        quantity: 1, shape: reimport.shape, raw, valid: true, issues: [], unit: 4,
      };
      parts.set(geometryKey, part);
    }
    return { segmentId: span.segment.id, leaf: leaf.leaf, opening: span.width, width: part.shape.width, height: part.shape.height };
  }));
  return { key: fenceKey(design, models), parts: [...parts.values()], dimensions, summary: analysis.summary };
}

