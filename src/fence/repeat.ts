import { bounds, distance, edges, EPS, inside, segmentDistance, signedArea, type Bounds, type Point, type Ring, type Shape } from '../geometry/polygon';

type Hole = { ring: Ring; box: Bounds; center: Point };
type Grid = { x: number[]; y: number[]; cells: Map<number, Hole> };
type Clearances = { border: number; bridge: number };
type CutOpening = { ring: Ring; box: Bounds; edges: ReturnType<typeof edges> };
const MAX_HOLES = 2499;
const MAX_VERTICES = 34000;

export function hasRepeatableOpenings(shape: Shape) {
  return shape.rings.length > 1 && shape.width > 0 && shape.height > 0 &&
    shape.depths.filter(depth => depth === 0).length === 1 && shape.depths.every(depth => depth === 0 || depth === 1);
}

function median(values: number[]) {
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  return (sorted[middle] + sorted[Math.floor((sorted.length-1)/2)]) / 2;
}

function groupAxis(holes: Hole[], axis: 'x'|'y') {
  const measure = axis === 'x' ? 'width' : 'height';
  const tolerance = Math.max(.005, median(holes.map(hole => hole.box[measure])) * .38);
  const groups: { center: number; members: Hole[] }[] = [];
  for (const hole of [...holes].sort((a,b) => a.center[axis]-b.center[axis])) {
    const value = hole.center[axis];
    const previous = groups.at(-1);
    if (!previous || value - previous.center > tolerance) {
      groups.push({ center: value, members: [hole] });
    } else {
      previous.center += (value - previous.center) / (previous.members.length + 1);
      previous.members.push(hole);
    }
  }
  return groups;
}

const pitches = (positions: number[]) => positions.slice(1).map((position,i) => position-positions[i]);
function regular(positions: number[]) {
  const steps = pitches(positions);
  if (steps.length < 2) return true;
  const pitch = median(steps);
  return steps.every(step => Math.abs(step-pitch) <= pitch * .24);
}

function findGrid(holes: Hole[]): Grid | undefined {
  const columns = groupAxis(holes,'x'), rows = groupAxis(holes,'y');
  const x = columns.map(column => column.center), y = rows.map(row => row.center);
  if (holes.length < columns.length * rows.length * .82 || !regular(x) || !regular(y)) return;
  const columnOf = new Map(columns.flatMap((column,i) => column.members.map(hole => [hole,i] as const)));
  const cells = new Map<number,Hole>();
  for (const [i,row] of rows.entries()) for (const hole of row.members) {
    const key = i * x.length + columnOf.get(hole)!;
    if (cells.has(key)) return;
    cells.set(key,hole);
  }
  return { x,y,cells };
}

function gridAxis(size: number, sourceSize: number, reference: number[], lower: number, upper: number, clearance: Clearances) {
  const usable = size - 2 * clearance.border;
  const extent = upper-lower;
  const pitch = reference.length > 1 ? median(pitches(reference)) : Math.max(extent + clearance.bridge, sourceSize - 2 * clearance.border);
  const maxCount = Math.floor((usable + clearance.bridge + EPS)/(extent + clearance.bridge));
  if (maxCount < 1) return [];
  const count = Math.min(maxCount, Math.max(1, Math.round((usable + clearance.bridge)/pitch)));
  if (count > MAX_HOLES) throw new Error('Mera panela daje previše ponovljenih otvora.');
  const start = clearance.border-lower, end = size-clearance.border-upper;
  return Array.from({length:count},(_,i) => count === 1 ? (start+end)/2 : start+(end-start)*i/(count-1));
}

function* gridCopies(grid: Grid, source: Shape, width: number, height: number, clearance: Clearances) {
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const [key,hole] of grid.cells) {
    const x=grid.x[key%grid.x.length], y=grid.y[Math.floor(key/grid.x.length)];
    minX=Math.min(minX,hole.box.minX-x);maxX=Math.max(maxX,hole.box.maxX-x);
    minY=Math.min(minY,hole.box.minY-y);maxY=Math.max(maxY,hole.box.maxY-y);
  }
  const x = gridAxis(width,source.width,grid.x,minX,maxX,clearance);
  const y = gridAxis(height,source.height,grid.y,minY,maxY,clearance);
  if (x.length*y.length > MAX_HOLES) throw new Error('Mera panela daje previše ponovljenih otvora.');
  const firstColumn = Math.max(0,Math.floor((grid.x.length-x.length)/2));
  const firstRow = Math.max(0,Math.floor((grid.y.length-y.length)/2));
  for (const [j,targetY] of y.entries()) for (const [i,targetX] of x.entries()) {
    const col=(i+firstColumn)%grid.x.length, row=(j+firstRow)%grid.y.length;
    const hole = grid.cells.get(row*grid.x.length+col);
    if (hole) yield hole.ring.map(p=>({x:p.x+targetX-grid.x[col],y:p.y+targetY-grid.y[row]}));
  }
}

function* tileCopies(holes: Hole[], width: number, height: number, clearance: Clearances) {
  const motif = bounds(holes.map(hole => hole.ring));
  // Repeat the occupied motif, omitting the blank border of the original panel between copies.
  const dx = motif.width + clearance.bridge;
  const dy = motif.height + clearance.bridge;
  const columns = Math.max(1,Math.ceil((width-2*clearance.border)/dx));
  const rows = Math.max(1,Math.ceil((height-2*clearance.border)/dy));
  if (columns*rows*holes.length > MAX_HOLES*4) throw new Error('Mera panela daje previše ponovljenih otvora.');
  const startX = (width-motif.minX-motif.maxX-(columns-1)*dx)/2;
  const startY = (height-motif.minY-motif.maxY-(rows-1)*dy)/2;
  for (let row=0; row<rows; row++) for (let col=0; col<columns; col++) {
    const x = startX+col*dx, y = startY+row*dy;
    for (const hole of holes) {
      if (hole.box.minX+x < clearance.border-EPS || hole.box.maxX+x > width-clearance.border+EPS ||
          hole.box.minY+y < clearance.border-EPS || hole.box.maxY+y > height-clearance.border+EPS) continue;
      yield hole.ring.map(p => ({ x:p.x+x,y:p.y+y }));
    }
  }
}

function boxesClose(a: Bounds, b: Bounds, gap: number) {
  return a.minX < b.maxX+gap-EPS && b.minX < a.maxX+gap-EPS &&
    a.minY < b.maxY+gap-EPS && b.minY < a.maxY+gap-EPS;
}

function openingLayout(outline: Ring, width: number, height: number, clearance: Clearances, bucketSize: number) {
  const rectangular = Math.abs(Math.abs(signedArea(outline)) - width*height) <= EPS;
  const outerEdges = rectangular ? [] : edges(outline).map(segment => ({ segment, box: bounds([segment]) }));
  const accepted: CutOpening[] = [];
  const buckets = new Map<string,CutOpening[]>();
  let vertices = outline.length + 1;
  function* bucketKeys(box: Bounds, gap = 0) {
    const left = Math.floor((box.minX-gap)/bucketSize), right = Math.floor((box.maxX+gap)/bucketSize);
    const bottom = Math.floor((box.minY-gap)/bucketSize), top = Math.floor((box.maxY+gap)/bucketSize);
    for (let y=bottom; y<=top; y++) for (let x=left; x<=right; x++) yield x+':'+y;
  }
  function add(ring: Ring, limitIsError: boolean) {
    const box = bounds([ring]);
    if (box.minX < clearance.border-EPS || box.maxX > width-clearance.border+EPS ||
        box.minY < clearance.border-EPS || box.maxY > height-clearance.border+EPS) return false;
    const segments = edges(ring);
    if (!rectangular && (!inside(ring[0],outline) ||
      outerEdges.some(({ segment:[c,d], box: edgeBox }) => boxesClose(box,edgeBox,clearance.border) &&
        segments.some(([a,b]) => segmentDistance(a,b,c,d)<clearance.border-EPS)))) return false;
    const nearby = new Set<CutOpening>();
    for (const key of bucketKeys(box,clearance.bridge)) for (const other of buckets.get(key)??[]) nearby.add(other);
    const conflicts = [...nearby].some(other => boxesClose(box,other.box,clearance.bridge) &&
      (inside(ring[0],other.ring) || inside(other.ring[0],ring) ||
        segments.some(([a,b]) => other.edges.some(([c,d]) => segmentDistance(a,b,c,d)<clearance.bridge-EPS))));
    if (conflicts) return false;
    if (accepted.length >= MAX_HOLES || vertices + ring.length + 1 > MAX_VERTICES) {
      if (limitIsError) throw new Error('Mera panela daje previše ponovljenih otvora.');
      return false;
    }
    vertices += ring.length+1;
    const opening = {ring,box,edges:segments};
    accepted.push(opening);
    for (const key of bucketKeys(box)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(opening);
      else buckets.set(key,[opening]);
    }
    return true;
  }
  const hasRoom = () => accepted.length < MAX_HOLES && vertices + 4 <= MAX_VERTICES;
  const covers = (point: Point) => {
    const key = Math.floor(point.x/bucketSize)+':'+Math.floor(point.y/bucketSize);
    return buckets.get(key)?.some(opening=>inside(point,opening.ring))??false;
  };
  return {accepted,add,hasRoom,covers};
}

function fillGaps(layout: ReturnType<typeof openingLayout>, holes: Hole[], width: number, height: number, clearance: Clearances) {
  if (!layout.hasRoom()) return;
  const border = clearance.border;
  const usableWidth = width - 2*border, usableHeight = height - 2*border;
  if (usableWidth <= 0 || usableHeight <= 0) return;
  const sizes = holes.map(hole=>({hole,area:Math.abs(signedArea(hole.ring))})).sort((a,b)=>b.area-a.area);
  const typical = Math.sqrt(median(sizes.map(item=>item.area)));
  // Sample the source size range, keeping the original contours and orientation.
  const sampleCount = Math.min(16,sizes.length);
  const templates = Array.from({length:sampleCount},(_,i)=>sizes[Math.round(i*(sizes.length-1)/Math.max(1,sampleCount-1))].hole);
  const step = Math.max(clearance.bridge/2,typical/4,Math.sqrt(usableWidth*usableHeight/3200));
  const columns = Math.min(3200,Math.max(1,Math.ceil(usableWidth/step)));
  const rows = Math.min(Math.max(1,Math.floor(3200/columns)),Math.max(1,Math.ceil(usableHeight/step)));
  const candidates: {point: Point; space: number}[] = [];
  for (let row=0; row<rows; row++) for (let col=0; col<columns; col++) {
    const point = {x:border+(col+.5)*usableWidth/columns,y:border+(row+.5)*usableHeight/rows};
    if (layout.covers(point)) continue;
    let space = Math.min(point.x-border,width-border-point.x,point.y-border,height-border-point.y);
    for (const {box} of layout.accepted) {
      const dx = Math.max(0,box.minX-point.x,point.x-box.maxX), dy = Math.max(0,box.minY-point.y,point.y-box.maxY);
      space = Math.min(space,Math.max(dx,dy));
      if (!space) break;
    }
    candidates.push({point,space});
  }
  candidates.sort((a,b)=>b.space-a.space);
  for (const {point} of candidates) {
    if (!layout.hasRoom()) break;
    if (layout.covers(point)) continue;
    for (const hole of templates) {
      const x = point.x-hole.center.x, y = point.y-hole.center.y;
      if (hole.box.minX+x < border-EPS || hole.box.maxX+x > width-border+EPS ||
          hole.box.minY+y < border-EPS || hole.box.maxY+y > height-border+EPS) continue;
      if (layout.add(hole.ring.map(p=>({x:p.x+x,y:p.y+y})),false)) break;
    }
  }
}

export function repeatOpenings(source: Shape, width: number, height: number, clearance: Clearances): Shape {
  if (!hasRepeatableOpenings(source)) throw new Error('Za popunjavanje je potreban šablon sa jednom spoljnom konturom i zatvorenim otvorima.');
  const outer = source.rings[source.depths.indexOf(0)];
  // Resize only the outer envelope. Every opening is translated as a whole.
  const outline = outer.map(p => ({x:p.x*width/source.width,y:p.y*height/source.height}));
  const holes = source.rings.filter((_,i) => source.depths[i]===1).map(ring => {
    const box=bounds([ring]);
    return { ring,box,center:{x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2} };
  });
  const bucketSize = Math.max(clearance.bridge*2,median(holes.map(hole=>Math.max(hole.box.width,hole.box.height))));
  const fit = (copies: Iterable<Ring>) => {
    const layout = openingLayout(outline,width,height,clearance,bucketSize);
    for (const ring of copies) layout.add(ring,true);
    return layout;
  };
  const sameSize = width===source.width&&height===source.height;
  const original = sameSize ? fit(holes.map(hole=>hole.ring)) : undefined;
  const grid = findGrid(holes);
  const patterned = original?.accepted.length === holes.length ? original :
    grid ? fit(gridCopies(grid,source,width,height,clearance)) : undefined;
  const layout = patterned?.accepted.length ? patterned : fit(tileCopies(holes,width,height,clearance));
  if (!grid || !patterned?.accepted.length) fillGaps(layout,holes,width,height,clearance);
  const cut = layout.accepted.map(hole=>hole.ring);
  if (!cut.length) throw new Error('U ovu meru ne staje ceo otvor iz šablona uz potreban obod. Promenite motiv ili izaberite drugi režim.');
  const rings = [outline,...cut];
  return {
    rings, depths:[0,...cut.map(()=>1)], width,height,
    area:Math.abs(signedArea(outline))-cut.reduce((sum,ring)=>sum+Math.abs(signedArea(ring)),0),
    length:rings.reduce((sum,ring)=>sum+edges(ring).reduce((length,[a,b])=>length+distance(a,b),0),0),
  };
}

