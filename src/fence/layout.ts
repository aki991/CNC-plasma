import { uid } from '../data/business';
import type { FenceDesign, FenceProject, PanelChoice, Post, Segment } from './types';

export const MIN_SPAN = 100;
export const MAX_SPAN = 12000;
export const MAX_SEGMENTS = 40;
const tidy = (mm: number) => Math.round(mm * 1000) / 1000;
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
export const initialPanel = (): PanelChoice => ({ modelId: 'OG-001', mode: 'parametric' });
export const postWidth = (design: FenceDesign, post: Post) => post.width ?? design.postWidth;
export const postHeight = (design: FenceDesign, post: Post, index: number) =>
  post.height ?? Math.max(design.height, design.segments[index - 1]?.top ?? 0, design.segments[index]?.top ?? 0) + design.postHeight;
export const segmentName = (segment: Segment, index: number) => (segment.kind === 'panel' ? 'Segment' : 'Kapija') + ' ' + (index + 1);
export function makeSegment(kind: Segment['kind'] = 'panel', width = kind === 'double' ? 3000 : kind === 'single' ? 1100 : 1800): Segment {
  return { id: uid(), kind, width, locked: false, panels: [initialPanel(), initialPanel()] };
}
export function newFence(): FenceProject {
  return {
    id: uid(), revision: 0, updatedAt: new Date().toISOString(),
    design: {
      name: 'Nova ograda', customerId: '', material: 'Čelik S235', thickness: 3, height: 1200,
      ground: 80, sideGap: 10, topGap: 0, meetingGap: 15, frame: 0,
      postWidth: 100, postHeight: 80, postType: 'steel',
      posts: [{ id: uid() }, { id: uid() }], segments: [makeSegment()],
    },
  };
}
export function duplicateFence(source: FenceProject): FenceProject {
  return {
    id: uid(), revision: 0, updatedAt: new Date().toISOString(),
    design: { ...structuredClone(source.design), name: source.design.name + ' – kopija' },
  };
}

/** The ALU Tim layout distinguishes post axes, clear openings and the outside extent.
 * Clear widths are stored here, so editing a post changes the outside extent directly. */
export function fenceLayout(design: FenceDesign) {
  let cursor = 0;
  const posts = design.posts.map((post, index) => {
    const width = postWidth(design, post);
    const x = cursor;
    cursor = tidy(x + width + (design.segments[index]?.width ?? 0));
    return { ...post, x, axis: x + width / 2, width, height: postHeight(design, post, index), type: post.type ?? design.postType };
  });
  const spans = design.segments.map((segment, index) => {
    const left = posts[index], right = posts[index + 1];
    const x = tidy(left.x + left.width);
    const sideGap = segment.sideGap ?? design.sideGap;
    const middle = segment.kind === 'double' ? segment.meetingGap ?? design.meetingGap : 0;
    const ground = segment.ground ?? design.ground;
    const plinthHeight = segment.kind === 'panel' ? segment.plinthHeight ?? design.plinthHeight ?? 0 : 0;
    const panelBottom = tidy(plinthHeight + ground);
    const top = segment.top ?? design.height;
    const outerHeight = tidy(top - panelBottom - design.topGap);
    const usable = tidy(segment.width - 2 * sideGap - middle);
    const first = segment.kind === 'double' ? segment.leftLeaf ?? tidy(usable / 2) : usable;
    const leaves = (segment.kind === 'double' ? [first, tidy(usable - first)] : [first]).map((width, leaf) => ({
      leaf, choice: segment.panels[leaf], x: tidy(x + sideGap + (leaf ? first + middle : 0)), ground: panelBottom, width,
      height: outerHeight, cutWidth: tidy(width - 2 * design.frame), cutHeight: tidy(outerHeight - 2 * design.frame),
    }));
    return { segment, index, x, width: segment.width, axisStart: left.axis, axisEnd: right.axis, top, ground, plinthHeight, leaves };
  });
  const fenceHeight = Math.max(0,...spans.map(span => span.top));
  const height = Math.max(fenceHeight, ...posts.map(post => post.height), ...spans.map(span => span.plinthHeight));
  return { posts, spans, length: cursor, fenceHeight, height };
}

export function insertSegment(design: FenceDesign, segment: Segment, after = design.segments.length - 1): FenceDesign {
  if (design.segments.length >= MAX_SEGMENTS) throw new Error('Projekat može imati najviše ' + MAX_SEGMENTS + ' segmenata.');
  const index = Math.max(0, Math.min(after + 1, design.segments.length));
  const segments = [...design.segments], posts = [...design.posts];
  if (!posts.length) posts.push({id:uid()});
  segments.splice(index, 0, segment);
  posts.splice(index + 1, 0, { id: uid() });
  return { ...design, segments, posts };
}
export function segmentBoundary(design: FenceDesign, index: number) {
  return index < design.segments.length - 1 ? index : index + 1;
}
export function removeSegment(design: FenceDesign, index: number, boundary = segmentBoundary(design,index)): FenceDesign {
  if (!design.segments[index] || (boundary!==index&&boundary!==index+1)) throw new Error('Izaberite segment i njegov granični stub.');
  return { ...design, segments: design.segments.filter((_, i) => i !== index), posts: design.posts.filter((_, i) => i !== boundary) };
}
export function removePost(design: FenceDesign, index: number, adjacentSegment?: number): FenceDesign {
  if (!design.posts[index]) throw new Error('Izaberite stub za brisanje.');
  if (!design.segments.length) return { ...design, posts: [] };
  return adjacentSegment===undefined ? mergeAtPost(design,index) : removeSegment(design,adjacentSegment,index);
}
export function moveSegment(design: FenceDesign, index: number, delta: -1 | 1): FenceDesign {
  const target = index + delta;
  if (target < 0 || target >= design.segments.length) return design;
  const segments = [...design.segments];
  [segments[index], segments[target]] = [segments[target], segments[index]];
  return { ...design, segments };
}
export function changeSegmentCount(design: FenceDesign, count: number): FenceDesign {
  if (!Number.isInteger(count) || count < 1 || count > MAX_SEGMENTS) throw new Error('Unesite broj segmenata od 1 do ' + MAX_SEGMENTS + '.');
  if (design.segments.slice(count).some(segment => segment.locked || segment.kind !== 'panel'))
    throw new Error('Pomerite ili pojedinačno uklonite kapije i zaključane segmente pre smanjenja broja.');
  if (count <= design.segments.length) return { ...design, segments: design.segments.slice(0, count), posts: design.posts.slice(0, count + 1) };
  let next = design;
  while (next.segments.length < count) next = insertSegment(next, makeSegment());
  return next;
}
export function splitWithPost(design: FenceDesign, index: number): FenceDesign {
  const segment = design.segments[index];
  if (!segment || segment.kind !== 'panel' || segment.locked) throw new Error('Izaberite otključan segment ograde za dodavanje stuba.');
  const width = tidy((segment.width - design.postWidth) / 2);
  if (width < minimumWidth(design, segment)) throw new Error('Segment je preuzak za dva panela i novi stub.');
  const next = insertSegment(design, { ...segment, id: uid(), width: tidy(segment.width - design.postWidth - width) }, index);
  const posts = [...next.posts];
  [posts[index + 1], posts[index + 2]] = [posts[index + 2], posts[index + 1]];
  next.posts = posts;
  next.segments[index] = { ...segment, width };
  return next;
}
function mergedWidth(design: FenceDesign, index: number) {
  const a = design.segments[index - 1], b = design.segments[index];
  if (!a || !b || a.kind !== 'panel' || b.kind !== 'panel' || a.locked || b.locked) return;
  return tidy(a.width + postWidth(design, design.posts[index]) + b.width);
}
export function canMergeAtPost(design: FenceDesign, index: number) {
  return (mergedWidth(design,index)??Infinity)<=MAX_SPAN;
}
export function mergeAtPost(design: FenceDesign, index: number): FenceDesign {
  const width = mergedWidth(design,index);
  if (width===undefined||width>MAX_SPAN) throw new Error('Susedni segmenti ne mogu da se spoje.');
  const segments = [...design.segments];
  segments.splice(index - 1, 2, { ...segments[index-1], width });
  return { ...design, segments, posts: design.posts.filter((_, i) => i !== index) };
}
function minimumWidth(design: FenceDesign, segment: Segment) {
  return Math.max(MIN_SPAN, 2 * (segment.sideGap ?? design.sideGap) + 2 * design.frame + 10);
}

/** Redistribute only adjustable clear spans, leaving shared posts, gates and locked widths in place. */
export function redistributeLength(design: FenceDesign, length: number, strategy: 'even' | 'proportional'): FenceDesign {
  if (!Number.isFinite(length) || length < 1 || length > 500000) throw new Error('Unesite ukupnu dužinu od 1 do 500.000 mm.');
  const adjustable = design.segments.filter(segment => !segment.locked && segment.kind === 'panel');
  const diff = tidy(length - fenceLayout(design).length);
  if (!diff) return design;
  if (!adjustable.length) throw new Error('Nema otključanih segmenata ograde za preraspodelu.');
  const growing = diff > 0;
  // Integer micrometers ensure the final length is exact to the editor's 0.001 mm precision.
  let remaining = Math.round(Math.abs(diff) * 1000);
  const rows = adjustable.map(segment => ({
    segment, used: 0, room: Math.max(0, Math.round((growing ? MAX_SPAN - segment.width : segment.width - minimumWidth(design, segment)) * 1000)),
    weight: strategy === 'even' ? 1 : Math.max(1, segment.width),
  }));
  if (total(rows.map(row => row.room)) < remaining) throw new Error('Zadata dužina ne staje u granice otključanih segmenata.');
  while (remaining > 0) {
    const active = rows.filter(row => row.used < row.room);
    const weight = total(active.map(row => row.weight));
    let applied = 0;
    for (const row of active) {
      const step = Math.min(row.room - row.used, remaining - applied, Math.max(1, Math.floor(remaining * row.weight / weight)));
      row.used += step;
      applied += step;
    }
    remaining -= applied;
  }
  const changes = new Map(rows.map(row => [row.segment.id, tidy(row.segment.width + (growing ? 1 : -1) * row.used / 1000)]));
  return { ...design, segments: design.segments.map(segment => changes.has(segment.id) ? { ...segment, width: changes.get(segment.id)! } : segment) };
}

