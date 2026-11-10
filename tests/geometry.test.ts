import { describe, expect, it } from 'vitest';
import { catalog, rectangle } from '../src/data/catalog';
import { parseDxf, writeDxf } from '../src/geometry/dxf';
import { conflicts, fits, optimize, placement, sheetStats, type NestSettings, type Part } from '../src/geometry/nesting';
import { bounds, makeShape, translate, type Ring } from '../src/geometry/polygon';

const dxf = (entities: string) => '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+entities+'0\nENDSEC\n0\nEOF\n';
const line = (x: number,y: number,a: number,b: number) => '0\nLINE\n8\nCUT\n10\n'+x+'\n20\n'+y+'\n11\n'+a+'\n21\n'+b+'\n';
const shapePart = (id: string, rings: Ring[], quantity=1): Part => ({id,name:id,quantity,shape:makeShape(rings)});
const settings: NestSettings={width:120,height:100,margin:4,gap:3,angles:[0,90],material:'Čelik S235',thickness:5,seconds:5,source:'new',remnants:[]};

describe('DXF',()=>{
  it('validates all 20 library models and measures the same geometry',()=>{
    for(const model of catalog){
      const actual=parseDxf(model.raw);
      expect(actual.issues,model.id).toEqual([]);
      expect(actual.valid).toBe(true);
      expect(actual.shape.width).toBeCloseTo(model.shape.width,5);
      expect(actual.shape.height).toBeCloseTo(model.shape.height,5);
      expect(actual.shape.area).toBeCloseTo(model.shape.area,3);
      expect(actual.shape.depths.some(depth=>depth===1)).toBe(true);
    }
  });
  it('converts INSUNITS and requests explicit confirmation for an unknown unit',()=>{
    const raw=writeDxf([rectangle(0,0,10,5)]);
    const inch=parseDxf(raw.replace('$INSUNITS\r\n70\r\n4','$INSUNITS\r\n70\r\n1'));
    expect(inch.valid).toBe(true);
    expect(inch.shape.width).toBe(254);
    const unknown=raw.replace('$INSUNITS\r\n70\r\n4','$INSUNITS\r\n70\r\n0');
    expect(parseDxf(unknown)).toMatchObject({needsUnit:true,valid:false});
    expect(parseDxf(unknown,5)).toMatchObject({valid:true,shape:{width:100,height:50}});
  });
  it('joins LINE and ARC, flattens circle holes and maintains physical scale',()=>{
    const arc='0\nARC\n8\nCUT\n10\n0\n20\n0\n40\n40\n50\n0\n51\n180\n';
    const circle='0\nCIRCLE\n8\nCUT\n10\n0\n20\n20\n40\n5\n';
    const parsed=parseDxf(dxf(arc+line(-40,0,40,0)+circle),4,.02);
    expect(parsed.issues).toEqual([]);
    expect(parsed.shape.width).toBeCloseTo(80,5);
    expect(parsed.shape.height).toBeCloseTo(40,1);
    expect(parsed.shape.depths).toEqual([0,1]);
    expect(parsed.shape.area).toBeCloseTo(775*Math.PI,-1);
  });
  it('reads legacy POLYLINE with a curved bulge',()=>{
    const vertex=(x:number,y:number,bulge=0)=>'0\nVERTEX\n8\nCUT\n10\n'+x+'\n20\n'+y+'\n42\n'+bulge+'\n';
    const polyline='0\nPOLYLINE\n8\nCUT\n66\n1\n70\n1\n'+vertex(0,0,1)+vertex(40,0)+vertex(40,30)+vertex(0,30)+'0\nSEQEND\n';
    const parsed=parseDxf(dxf(polyline),4,.015);
    expect(parsed.issues).toEqual([]);
    expect(parsed.shape.width).toBeCloseTo(40,2);
    expect(parsed.shape.height).toBeCloseTo(50,1);
  });
  it('flattens ellipse and clamped cubic spline',()=>{
    const ellipse='0\nELLIPSE\n8\nCUT\n10\n0\n20\n0\n11\n10\n21\n0\n40\n0.5\n41\n0\n42\n6.283185307179586\n';
    expect(parseDxf(dxf(ellipse))).toMatchObject({valid:true,shape:{width:20,height:10}});
    const spline=['0','SPLINE','8','CUT','70','8','71','3','72','8','73','4', ...[0,0,0,0,1,1,1,1].flatMap(n=>['40',n]),
      ...[[0,0],[0,40],[40,40],[40,0]].flatMap(([x,y])=>['10',x,'20',y,'30',0]),''].join('\n');
    expect(parseDxf(dxf(spline+line(40,0,0,0)),4,.03)).toMatchObject({valid:true,shape:{width:40,height:30}});
  });
  it('rejects corrupt data, open contours, unsupported entities and nonplanar data',()=>{
    expect(parseDxf('Hello').valid).toBe(false);
    expect(parseDxf(dxf(line(0,0,10,0))).issues.join()).toMatch(/Otvoreni segmenti/);
    expect(parseDxf(dxf('0\nCIRCLE\n10\n0\n20\n0\n40\n5\n230\n-1\n')).valid).toBe(false);
    const text='0\nTEXT\n8\nCUT\n10\n0\n20\n0\n40\n2\n1\nNaslov\n';
    expect(parseDxf(dxf(text+line(0,0,10,0))).issues.join()).toMatch(/Nepodržan entitet: TEXT/);
  });
  it('rejects crossing, duplicate and touching contours',()=>{
    const bow=[{x:0,y:0},{x:50,y:50},{x:0,y:50},{x:50,y:0}];
    expect(parseDxf(writeDxf([bow])).issues.join()).toMatch(/samopresecanje/);
    const rect=rectangle(0,0,40,60);
    expect(parseDxf(writeDxf([rect,[...rect].reverse()])).issues.join()).toMatch(/duplirana/);
    expect(parseDxf(writeDxf([rect,rectangle(40,0,5,5)])).issues.join()).toMatch(/dodiruju/);
  });
});

describe('Nesting',()=>{
  it('fits a single part with configured margins and rotation, and rejects an oversize part',()=>{
    const part=shapePart('a',[rectangle(0,0,88,105)]);
    const result=optimize([part],settings);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].placements[0]).toMatchObject({angle:90,x:4,y:4});
    expect(optimize([part],{...settings,angles:[0]}).unplaced).toEqual(['a:0']);
  });
  it('fits irregular outlines with overlapping bounding boxes without geometrical collision',()=>{
    const lower=shapePart('lower',[[{x:0,y:0},{x:100,y:0},{x:0,y:85}]]);
    const upper=shapePart('upper',[[{x:100,y:0},{x:100,y:85},{x:0,y:85}]]);
    const a=placement(lower,'a',0,4,4), b=placement(upper,'b',0,11,10);
    expect(conflicts(a,b,3)).toBe(false);
    const result=optimize([lower,upper],{...settings,angles:[0]});
    expect(result.sheets).toHaveLength(1);
    expect(result.unplaced).toEqual([]);
  });
  it('checks minimum distance, touching, containment, margins and sheet boundaries',()=>{
    const part=shapePart('a',[rectangle(0,0,25,20)]);
    const a=placement(part,'a',0,4,4);
    const sheet={width:120,height:100,placements:[a]};
    expect(fits(placement(part,'b',0,31,4),sheet,settings)).toBe(false);
    expect(fits(placement(part,'b',0,32,4),sheet,settings)).toBe(true);
    expect(fits(placement(part,'b',0,3,30),sheet,settings)).toBe(false);
    expect(fits(placement(part,'b',0,92,30),sheet,settings)).toBe(false);
    expect(conflicts(a,placement(part,'b',0,29,4),0)).toBe(true);
    const hole=shapePart('hole',[rectangle(0,0,50,50),rectangle(5,5,40,40)]);
    expect(conflicts(placement(hole,'h',0),placement(part,'b',0,10,10),0)).toBe(true);
  });
  it('uses multiple sheets, maintains original shapes, and calculates net area without holes',()=>{
    const part=shapePart('a',[rectangle(0,0,64,60),rectangle(10,10,20,15)],5);
    const before=JSON.stringify(part);
    const result=optimize([part],settings);
    expect(result.sheets).toHaveLength(5);
    expect(result.unplaced).toEqual([]);
    expect(JSON.stringify(part)).toBe(before);
    const stats=sheetStats(result.sheets);
    expect(stats).toMatchObject({area:(64*60-300)*5,total:120*100*5,count:5,pierces:10});
    expect(stats.yield).toBeCloseTo((64*60-300)/(120*100)*100);
    result.sheets.forEach(sheet=>sheet.placements.forEach(p=>expect(fits(p,sheet,settings)).toBe(true)));
  });
  it('respects a concave remnant and locked positions',()=>{
    const outline=[{x:0,y:0},{x:120,y:0},{x:120,y:45},{x:55,y:45},{x:55,y:100},{x:0,y:100}];
    const part=shapePart('a',[rectangle(0,0,26,26)],3);
    const config={...settings,source:'remnant' as const,remnants:[{id:'M-1:0',width:120,height:100,outline}]};
    const result=optimize([part],config);
    expect(result.unplaced).toEqual([]);
    const p=result.sheets[0].placements[0];p.locked=true;
    const next=optimize([part],config,result);
    expect(next.sheets[0].placements.find(x=>x.id===p.id)).toEqual(p);
    expect(fits(placement(part,'bad',0,80,57),{...config.remnants[0],placements:[]},config)).toBe(false);
  });
  it('exports and reimports the exact layout bounds, holes and distances in millimeters',()=>{
    const part=shapePart('a',[rectangle(0,0,25,20),rectangle(5,5,7,8)],4);
    const result=optimize([part],settings);
    const sheet=result.sheets[0];
    const rings=sheet.placements.flatMap(p=>translate(p.rings,p.x,p.y));
    const reimport=parseDxf(writeDxf(rings,rectangle(0,0,sheet.width,sheet.height)));
    expect(reimport.valid).toBe(true);
    expect(reimport.unit).toBe(4);
    expect(reimport.shape.rings).toHaveLength(8);
    expect(reimport.shape.width).toBeCloseTo(bounds(rings).width,6);
    expect(reimport.shape.height).toBeCloseTo(bounds(rings).height,6);
    expect(reimport.shape.area).toBeCloseTo(sheetStats([sheet]).area,6);
  });
  it('produces repeatable layouts from a fixed seed and survives serialization',()=>{
    let seed=1357;
    const parts=catalog.slice(18).map(model=>{
      seed=(Math.imul(1664525,seed)+1013904223)>>>0;
      return {...model,quantity:seed%3+2};
    });
    const config={...settings,width:620,height:420};
    const first=optimize(parts,config,undefined,2), second=optimize(parts,config,undefined,2);
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});

