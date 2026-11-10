import { rectangle } from '../data/catalog';
import { bounds, distance, edges, EPS, inside, makeShape, segmentDistance, selfIntersects, signedArea, type Bounds, type Point, type Ring } from '../geometry/polygon';

export type VoronoiSettings = {
  frame: number;
  web: number;
  openings: number;
  rounding: number;
  seed: number;
};

export const defaultVoronoi: Readonly<VoronoiSettings> = { frame: 30, web: 12, openings: 68, rounding: 55, seed: 1 };
export const maxVoronoiOpenings = 200;
const minOpening = 4;
const cutPrecision = 1000;
const pad = .002; // Keep the requested clearance after snapping preview and DXF coordinates.

export function newVoronoiSeed(previous?: number) {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  return seed === previous ? (seed + 1) >>> 0 : seed;
}

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function seedSites(width: number, height: number, count: number, seed: number, border: number) {
  const random = randomSequence(seed);
  const sites: Point[] = [];
  for (let i=0; i<count; i++) {
    let best: Point | undefined;
    let bestScore = -1;
    // A small best-candidate sample avoids clumps while keeping the pattern irregular.
    for (let trial=0; trial<(i ? 6 : 1); trial++) {
      const point = {x:border+random()*width,y:border+random()*height};
      let score = Infinity;
      for (const site of sites) score = Math.min(score,(site.x-point.x)**2+(site.y-point.y)**2);
      if (score > bestScore) { best=point; bestScore=score; }
    }
    sites.push(best!);
  }
  return sites;
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t });

function clip(polygon: Ring, nx: number, ny: number, limit: number) {
  const points: Ring = [];
  let previous = polygon.at(-1)!;
  let previousDistance = previous.x*nx+previous.y*ny-limit;
  for (const point of polygon) {
    const nextDistance = point.x*nx+point.y*ny-limit;
    if ((nextDistance <= 0) !== (previousDistance <= 0)) {
      points.push(lerp(previous,point,previousDistance/(previousDistance-nextDistance)));
    }
    if (nextDistance <= 0) points.push(point);
    previous = point;
    previousDistance = nextDistance;
  }
  return points;
}

function cell(sites: Point[], index: number, outline: Ring, inset: number) {
  const site = sites[index];
  let polygon = outline;
  for (const [i,neighbor] of sites.entries()) {
    if (i === index) continue;
    const dx = neighbor.x-site.x, dy = neighbor.y-site.y;
    const length = Math.hypot(dx,dy);
    if (length < EPS) return [];
    const nx = dx/length, ny = dy/length;
    const limit = ((site.x+neighbor.x)*nx+(site.y+neighbor.y)*ny)/2-inset;
    polygon = clip(polygon,nx,ny,limit);
    if (polygon.length < 3) return [];
  }
  return polygon;
}

function centroid(polygon: Ring) {
  let x=0, y=0, sum=0;
  for (const [a,b] of edges(polygon)) {
    const cross=a.x*b.y-b.x*a.y;
    x+=(a.x+b.x)*cross;
    y+=(a.y+b.y)*cross;
    sum+=cross;
  }
  return {x:x/(3*sum),y:y/(3*sum)};
}

function roundCell(polygon: Ring, rounding: number) {
  if (!rounding) return polygon;
  return polygon.flatMap((point,i) => {
    const previous=polygon[(i+polygon.length-1)%polygon.length], next=polygon[(i+1)%polygon.length];
    const left=distance(point,previous), right=distance(point,next);
    const trim=Math.min(left,right)*.46*rounding/100;
    if (trim < .003) return [point];
    const start=lerp(point,previous,trim/left), end=lerp(point,next,trim/right);
    const steps=Math.min(20,Math.max(2,Math.ceil(Math.sqrt(trim/.15))));
    // Quadratic arcs stay within the convex inset cell, including after the corner is flattened.
    return Array.from({length:steps+1},(_,step)=>{
      const t=step/steps;
      return lerp(lerp(start,point,t),lerp(point,end,t),t);
    });
  });
}

function snapRing(polygon: Ring) {
  const ring: Ring = [];
  for (const {x,y} of polygon) {
    const point = {x:Math.round(x*cutPrecision)/cutPrecision,y:Math.round(y*cutPrecision)/cutPrecision};
    if (!ring.length || distance(ring.at(-1)!,point)>EPS) ring.push(point);
  }
  if (ring.length>1 && distance(ring[0],ring.at(-1)!)<=EPS) ring.pop();
  return ring;
}

function minimumWidth(ring: Ring) {
  let width = Infinity;
  for (const [a,b] of edges(ring)) {
    const length=distance(a,b), nx=(a.y-b.y)/length, ny=(b.x-a.x)/length;
    let lower=Infinity, upper=-Infinity;
    for (const point of ring) {
      const projection=point.x*nx+point.y*ny;
      lower=Math.min(lower,projection);
      upper=Math.max(upper,projection);
    }
    width=Math.min(width,upper-lower);
  }
  return width;
}

function verifyHoles(holes: Ring[], width: number, height: number, settings: VoronoiSettings) {
  const contours = holes.map(ring => ({
    ring, box:bounds([ring]), segments:edges(ring).map(segment=>({segment,box:bounds([segment])})),
  }));
  const { frame,web } = settings;
  const threshold=(web-EPS)**2;
  const mayBeCloser = (a: Bounds,b: Bounds) => {
    const dx=Math.max(0,a.minX-b.maxX,b.minX-a.maxX);
    const dy=Math.max(0,a.minY-b.maxY,b.minY-a.maxY);
    return dx*dx+dy*dy<threshold;
  };
  for (const {box} of contours) {
    if (box.minX < frame-EPS || box.minY < frame-EPS || box.maxX > width-frame+EPS || box.maxY > height-frame+EPS)
      throw new Error('Otvor prelazi zadatu širinu rama.');
  }
  for (const [i,a] of contours.entries()) for (let j=0; j<i; j++) {
    const b=contours[j];
    if (!mayBeCloser(a.box,b.box)) continue;
    if (inside(a.ring[0],b.ring) || inside(b.ring[0],a.ring) || a.segments.some(first =>
        b.segments.some(second=>mayBeCloser(first.box,second.box)&&segmentDistance(...first.segment,...second.segment)<web-EPS))) {
      throw new Error('Konture otvora ne poštuju zadatu minimalnu širinu lima između otvora.');
    }
  }
}

export function voronoiPanel(width: number, height: number, settings: VoronoiSettings) {
  const { frame,web,openings,rounding,seed }=settings;
  if (![width,height,frame,web,rounding].every(Number.isFinite) || width<=0 || height<=0 ||
      frame<.1 || web<.1 || rounding<0 || rounding>100 || !Number.isInteger(seed) || seed<0 || seed>0xffffffff)
    throw new Error('Proverite dimenzije, širinu rama, širinu lima između otvora i zaobljenje.');
  if (!Number.isInteger(openings) || openings<1 || openings>maxVoronoiOpenings)
    throw new Error('Unesite broj otvora od 1 do '+maxVoronoiOpenings+'.');
  const border=frame+pad;
  const innerWidth=width-2*border, innerHeight=height-2*border;
  if (Math.min(innerWidth,innerHeight)<minOpening)
    throw new Error('Ram je preširok za ovu meru panela. Za otvor mora ostati najmanje 4 mm.');
  const field=rectangle(border,border,innerWidth,innerHeight);
  const start=seedSites(innerWidth,innerHeight,openings,seed,border);
  const sites=start.map((point,i)=>{
    const polygon=cell(start,i,field,0);
    return polygon.length>=3 && signedArea(polygon)>EPS ? centroid(polygon) : point;
  });
  const holes: Ring[]=[];
  let rejected=0;
  let vertices=5;
  for (let i=0; i<openings; i++) {
    // Every pair of inset cells is separated by at least the web across its common bisector.
    const polygon=cell(sites,i,field,web/2+pad);
    const hole=snapRing(roundCell(polygon,rounding));
    if (hole.length<3 || signedArea(hole)<=EPS || selfIntersects(hole) || minimumWidth(hole)<minOpening-EPS) {
      rejected++;
      continue;
    }
    holes.push(hole);
    vertices+=hole.length+1;
  }
  if (rejected)
    throw new Error(rejected+' od '+openings+' otvora je premalo ili neispravno. Smanjite broj otvora, širinu rama, razmak ili zaobljenje.');
  if (vertices>34000) throw new Error('Voronoi ima previše temena za DXF. Smanjite broj otvora ili zaobljenje.');
  verifyHoles(holes,width,height,settings);
  return makeShape([rectangle(0,0,width,height),...holes]);
}

