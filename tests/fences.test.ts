import { beforeAll, describe, expect, it } from 'vitest';
import { calculation, createQuote } from '../src/data/business';
import { catalog, rectangle } from '../src/data/catalog';
import { seed } from '../src/data/seed';
import type { State } from '../src/data/types';
import { sendFenceToJob } from '../src/fence/jobs';
import { changeSegmentCount, duplicateFence, fenceLayout, insertSegment, makeSegment, mergeAtPost, moveSegment, newFence, redistributeLength, removePost, removeSegment, splitWithPost } from '../src/fence/layout';
import { analyzeFence, fenceKey, generateFence, panelGeometry } from '../src/fence/panels';
import { parseDxf, writeDxf } from '../src/geometry/dxf';
import { optimize, sheetStats } from '../src/geometry/nesting';
import { bounds, edges, makeShape, segmentDistance, type Ring } from '../src/geometry/polygon';

describe('Ravna ograda',()=>{
  it('separates clear openings, post axes and physical panel size with two posts',()=>{
    const design=newFence().design;
    const layout=fenceLayout(design);
    expect(layout.posts.map(p=>p.axis)).toEqual([50,1950]);
    expect(layout).toMatchObject({length:2000,fenceHeight:1200,height:1280});
    expect(layout.spans[0]).toMatchObject({x:100,width:1800,axisStart:50,axisEnd:1950});
    expect(layout.spans[0].leaves[0]).toMatchObject({x:110,ground:80,width:1780,height:1120,cutWidth:1780,cutHeight:1120});
  });
  it('adds four shared posts and preserves panel widths when a post gets wider',()=>{
    const design=changeSegmentCount(newFence().design,3);
    const modified={...design,posts:design.posts.map((post,i)=>i===1?{...post,width:150}:post),height:1400,sideGap:15,topGap:20,ground:100,frame:25};
    const layout=fenceLayout(modified);
    expect(layout.length).toBe(5850);
    expect(layout.posts).toHaveLength(4);
    expect(layout.spans.map(s=>s.width)).toEqual([1800,1800,1800]);
    expect(layout.spans[0].leaves[0]).toMatchObject({width:1770,height:1280,cutWidth:1720,cutHeight:1230});
  });
  it('applies the project plinth height to panels with individual overrides and leaves gates clear',()=>{
    const project=newFence();
    const design=changeSegmentCount({...project.design,plinthHeight:200},3);
    design.segments[1].plinthHeight=0;
    design.segments[2].plinthHeight=300;
    project.design=insertSegment(design,makeSegment('single'),1);
    const layout=fenceLayout(project.design);
    expect(layout.fenceHeight).toBe(1200);
    expect(layout.spans.map(span=>[span.plinthHeight,span.leaves[0].ground,span.leaves[0].cutHeight]))
      .toEqual([[200,280,920],[0,80,1120],[0,80,1120],[300,380,820]]);
    project.design.plinthHeight=1200;
    expect(()=>generateFence(project,catalog)).toThrow(/Smanjite visinu podnožja/);
  });
  it('splits and joins at the shared post while preserving total length and endpoint identities',()=>{
    const design=newFence().design;
    const split=splitWithPost(design,0);
    expect(split.segments.map(s=>s.width)).toEqual([850,850]);
    expect(split.posts.map(p=>p.id).filter(id=>design.posts.some(p=>p.id===id))).toEqual(design.posts.map(p=>p.id));
    expect(fenceLayout(split).length).toBe(2000);
    expect(mergeAtPost(split,1)).toEqual(design);
  });
  it('can delete a boundary post and its adjacent gate or rebuild a completely empty fence',()=>{
    const design=newFence().design;
    const withGate=insertSegment(design,makeSegment('single'));
    expect(removePost(withGate,2,1)).toEqual(design);
    const onePost=removeSegment(design,0);
    expect(onePost.segments).toHaveLength(0);
    expect(onePost.posts).toEqual([design.posts[0]]);
    const empty=removePost(onePost,0);
    expect(fenceLayout(empty)).toMatchObject({posts:[],spans:[],length:0,height:0});
    expect(insertSegment(empty,makeSegment()).posts).toHaveLength(2);
  });
  it('redistributes only unlocked non-gate widths and rejects unreachable totals',()=>{
    const base=changeSegmentCount(newFence().design,3);
    base.segments[0]={...base.segments[0],width:1500,locked:true};
    base.segments[1]={...base.segments[1],width:2100};
    const gate=makeSegment('single',1100);
    const design=insertSegment(base,gate,1);
    const expanded=redistributeLength(design,fenceLayout(design).length+720.125,'proportional');
    expect(fenceLayout(expanded).length).toBe(fenceLayout(design).length+720.125);
    expect(expanded.segments[0].width).toBe(1500);
    expect(expanded.segments[2]).toEqual(gate);
    expect(expanded.segments[1].width-2100).toBeGreaterThan(expanded.segments[3].width-1800);
    const moved=moveSegment(expanded,2,-1);
    expect(moved.segments[1]).toEqual(gate);
    expect(removeSegment(moved,1).posts.length).toBe(moved.posts.length-1);
    expect(()=>redistributeLength(design,100,'even')).toThrow(/ne staje/);
  });
  it('accounts for gate clearances and allows two independent leaf templates and widths',()=>{
    const project=newFence();
    const gate=makeSegment('double',3000);
    gate.leftLeaf=1300;
    gate.panels[1]={modelId:'OG-002',mode:'parametric'};
    project.design=insertSegment({...project.design,frame:20},gate);
    const layout=fenceLayout(project.design);
    expect(layout.spans[1].leaves.map(leaf=>[leaf.width,leaf.cutWidth,leaf.choice.modelId]))
      .toEqual([[1300,1260,'OG-001'],[1665,1625,'OG-002']]);
    expect(layout.spans[1].leaves[1].x-layout.spans[1].leaves[0].x).toBe(1315);
    const output=generateFence(project,catalog);
    expect(output.summary).toMatchObject({postCount:3,panelCount:3,sheetPartCount:3,gateCount:1});
    expect(output.parts).toHaveLength(3);
  });
});

describe('Proizvodni DXF ograde',()=>{
  const model=catalog.find(m=>m.id==='OG-004')!;
  it('keeps fixed geometry and reports mismatch without deforming the template',()=>{
    const choice={modelId:model.id,mode:'fixed' as const,fixedSize:true as const};
    expect(panelGeometry(choice,1200,600,3,model).error).toContain('Fiksni šablon');
    expect(panelGeometry(choice,model.shape.width,model.shape.height,3,model).shape).toBe(model.shape);
  });
  it('uses uniform scaling, fits the opening, and requires explicit approval',()=>{
    const project=newFence();
    project.design.segments[0].panels[0]={modelId:model.id,mode:'proportional'};
    expect(()=>generateFence(project,catalog)).toThrow(/Potvrdite proporcionalno/);
    const [part]=generateFence(project,catalog,true).parts;
    expect(part.shape.width/part.shape.height).toBeCloseTo(model.shape.width/model.shape.height,6);
    expect(part.shape.height).toBe(1120);
    expect(part.shape.width).toBe(1680);
    expect(part.shape.rings.length).toBe(model.shape.rings.length);
  });
  it('changes the number of openings without rescaling the repeated motif',()=>{
    const choice={modelId:'OG-013',mode:'parametric' as const,opening:25,bridge:16,border:25};
    const library=catalog.find(m=>m.id===choice.modelId);
    const small=panelGeometry(choice,300,200,4,library).shape!;
    const large=panelGeometry(choice,500,200,4,library).shape!;
    expect(large.rings.length).toBeGreaterThan(small.rings.length);
    expect(large.rings[1][0].x-large.rings[1][12].x).toBeCloseTo(25);
    expect(panelGeometry({...choice,bridge:2},500,200,4,library).error).toMatch(/mostovi/);
    expect(panelGeometry({modelId:model.id,mode:'parametric'},500,200,4,model).error).toMatch(/nema parametarska/);
  });
  it('groups equal shapes, reimports exact millimeter geometry and exports only cut contours',()=>{
    const project=newFence();
    project.design=changeSegmentCount(project.design,3);
    const output=generateFence(project,catalog);
    expect(output.parts).toHaveLength(1);
    const [part]=output.parts;
    expect(part.quantity).toBe(3);
    expect(output.dimensions).toHaveLength(3);
    const parsed=parseDxf(part.raw);
    expect(parsed).toMatchObject({valid:true,unit:4,shape:{width:1780,height:1120}});
    expect(parsed.shape.depths.filter(depth=>depth===0)).toHaveLength(1);
    expect(parsed.shape.depths).toContain(1);
    expect(part.raw).not.toMatch(/\r\n(?:TEXT|DIMENSION)\r\n/);
    expect(analyzeFence({...project.design,ground:1200},catalog).errors.length).toBeGreaterThan(0);
  });

  it('fills a 1000 × 1000 panel with 64 unscaled openings from OG-011 and adapts old fixed selections',()=>{
    const source=catalog.find(item=>item.id==='OG-011')!;
    const signature=(ring:Ring)=>ring.map(point=>[
      Math.round((point.x-ring[0].x)*1e6),Math.round((point.y-ring[0].y)*1e6),
    ].join(',')).join(';');
    const originals=new Set(source.shape.rings.slice(1).map(signature));
    const project=newFence();
    project.design.height=1080;
    project.design.thickness=5;
    project.design.segments[0].width=1020;
    project.design.segments[0].panels[0]={modelId:source.id,mode:'fixed'};
    const result=analyzeFence(project.design,catalog).spans[0].leaves[0].panel;
    expect(result.mode).toBe('repeat');
    expect(result.shape).toMatchObject({width:1000,height:1000});
    const holes=result.shape!.rings.slice(1);
    expect(holes).toHaveLength(64);
    expect(holes.every(hole=>originals.has(signature(hole)))).toBe(true);
    const extent=bounds(holes);
    expect(extent.minY).toBeLessThan(30);
    expect(extent.maxY).toBeGreaterThan(970);
    expect(extent.minX).toBeGreaterThanOrEqual(21.99999);
    expect(extent.maxX).toBeLessThanOrEqual(978.00001);
    const [part]=generateFence(project,catalog).parts;
    expect(parseDxf(part.raw)).toMatchObject({valid:true,unit:4,shape:{width:1000,height:1000}});
    expect(part.shape.rings).toHaveLength(65);
    const tooSmall=panelGeometry({modelId:source.id,mode:'repeat'},50,50,5,source);
    expect(tooSmall.error).toContain('ne staje ceo otvor');
  });

  it('fills the available size with every library fence motif and a user DXF',()=>{
    for (const source of catalog.slice(0,18)) {
      const preview=panelGeometry({modelId:source.id,mode:'repeat'},1800,1120,3,source);
      expect(preview.error,source.id).toBeUndefined();
      expect(preview.shape,source.id).toMatchObject({width:1800,height:1120});
      expect(preview.shape!.rings.length,source.id).toBeGreaterThan(1);
    }
    const source={...catalog[11],id:'uvezeni-rombovi'};
    const preview=panelGeometry({modelId:source.id,mode:'repeat'},1482.5,1120,5,source);
    expect(preview.shape).toMatchObject({width:1482.5,height:1120});
    expect(preview.shape!.rings.length).toBeGreaterThan(source.shape.rings.length);
  });

  it('maintains the border and minimum bridge on a shaped gate outline',()=>{
    const source=catalog.find(item=>item.id==='OG-015')!;
    const preview=panelGeometry({modelId:source.id,mode:'repeat'},1482.5,1120,5,source);
    expect(preview.error).toBeUndefined();
    const [outline,...holes]=preview.shape!.rings;
    expect(outline).toHaveLength(source.shape.rings[0].length);
    const perimeter=edges(outline);
    const segments=holes.map(edges);
    for (const [i,hole] of segments.entries()) for (const [a,b] of hole) {
      expect(perimeter.every(([c,d])=>segmentDistance(a,b,c,d)>=22-1e-6)).toBe(true);
      for (const other of segments.slice(0,i)) {
        expect(other.every(([c,d])=>segmentDistance(a,b,c,d)>=15-1e-6)).toBe(true);
      }
    }
  });

  it('fills the empty seam and edge zones of an irregular imported stone pattern',()=>{
    const stones = [
      [100,90,52,54],[200,78,68,42],[295,97,61,64],
      [65,152,37,36],[150,154,65,60],[255,164,66,43],[338,159,42,43],
      [106,224,47,51],[202,220,75,45],[290,232,62,48],
    ].map(([x,y,w,h])=>[[-.5,-.16],[-.33,-.5],[.26,-.48],[.5,-.15],[.39,.43],[-.18,.5]].map(([u,v])=>({
      x:x+u*w,y:y+v*h,
    })));
    const shape=makeShape([rectangle(0,0,420,320),...stones]);
    const source={...catalog[0],id:'uvezeni-kamen',name:'Kamen',shape,raw:writeDxf(shape.rings)};
    expect(parseDxf(source.raw).valid).toBe(true);
    const preview=panelGeometry({modelId:source.id,mode:'repeat'},430,640,3,source);
    expect(preview.error).toBeUndefined();
    const holes=preview.shape!.rings.slice(1);
    const boxes=holes.map(hole=>bounds([hole]));
    expect(holes.length).toBeGreaterThan(30);
    expect(boxes.some(box=>box.minY<320&&box.maxY>320)).toBe(true);
    expect(boxes.some(box=>box.minY<58)).toBe(true);
    expect(boxes.some(box=>box.maxY>582)).toBe(true);
    const outlineSignature=(ring:Ring)=>ring.map(point=>[
      Math.round((point.x-ring[0].x)*1e6),Math.round((point.y-ring[0].y)*1e6),
    ].join(',')).join(';');
    const originals=new Set(stones.map(outlineSignature));
    expect(holes.every(hole=>originals.has(outlineSignature(hole)))).toBe(true);
    const sameSize=panelGeometry({modelId:source.id,mode:'repeat'},420,320,3,source).shape!;
    expect(sameSize.rings.length).toBeGreaterThan(shape.rings.length);
    expect(sameSize.rings.slice(0,shape.rings.length)).toEqual(shape.rings);
    const reimport=parseDxf(writeDxf(preview.shape!.rings));
    expect(reimport).toMatchObject({valid:true,shape:{width:430,height:640}});
  });
});

describe('Poslovi i kalkulacija ograde',()=>{
  let workshop:State;
  beforeAll(()=>{workshop=seed();});
  function fixture(){
    const state=structuredClone(workshop);
    const project=newFence();
    project.design={...project.design,customerId:state.customers[0].id,frame:15};
    project.generated=generateFence(project,state.models);
    return {state,project};
  }
  it('creates a real job and prices the physical posts, frame and nested sheet usage',()=>{
    const {state,project}=fixture();
    const jobId=sendFenceToJob(state,project,'');
    const job=state.jobs.find(job=>job.id===jobId)!;
    expect(job).toMatchObject({name:project.design.name,customerId:project.design.customerId,kind:'product',fence:{postCount:2,panelCount:1}});
    job.nest=optimize(job.parts,{width:3000,height:1500,gap:5,margin:10,angles:[0,90],seconds:2,material:job.material,
      thickness:job.thickness,source:'new',remnants:[]});
    const stats=sheetStats(job.nest.sheets);
    expect(stats.count).toBe(1);
    const calc=calculation(state,job);
    expect(calc.lines.find(line=>line.key==='posts')?.quantity).toBe(2);
    expect(calc.lines.find(line=>line.key==='frame')?.quantity).toBe(5.8);
    expect(calc.lines.find(line=>line.key==='waste')?.quantity).toBeCloseTo(stats.waste/1e6,4);
    expect(createQuote(state,job,calc)).toMatchObject({jobId,jobName:project.design.name});
  });
  it('updates only its generated parts in a compatible job and leaves identical re-sends intact',()=>{
    const {state,project}=fixture();
    const manual={...state.models[0],id:'manual'};
    const job=state.jobs[0];
    Object.assign(job,{customerId:project.design.customerId,material:project.design.material,thickness:project.design.thickness,parts:[manual]});
    const before=state.jobs.length;
    const id=sendFenceToJob(state,project,job.id);
    expect(id).toBe(job.id);
    expect(state.jobs).toHaveLength(before);
    expect(job.nest).toBeUndefined();
    expect(state.reservations.some(reservation=>reservation.jobId===id)).toBe(false);
    expect(state.calculations.some(calc=>calc.jobId===id)).toBe(false);
    project.jobId=id;
    expect(sendFenceToJob(state,project,id)).toBe(id);
    expect(job.parts).toHaveLength(2);
    expect(job.parts[0]).toEqual(manual);
    project.design={...project.design,height:1300};
    expect(()=>sendFenceToJob(state,project,id)).toThrow(/aktuelnu verziju/);
    project.generated=generateFence(project,state.models);
    sendFenceToJob(state,project,id);
    expect(job.parts).toHaveLength(2);
    expect(job.parts[1].shape.height).toBe(1190);
    project.design={...project.design,height:1400};
    project.generated=generateFence(project,state.models);
    job.status='U sečenju';
    expect(()=>sendFenceToJob(state,project,id)).toThrow(/već u proizvodnji/);
    expect(duplicateFence(project)).toMatchObject({revision:0,design:{height:1400}});
    expect(duplicateFence(project).jobId).toBeUndefined();
  });

  it('requires a new export when an existing project used the previous repeat layout',()=>{
    const {state,project}=fixture();
    const source=state.models.find(item=>item.id==='OG-011')!;
    project.design.segments[0].panels[0]={modelId:source.id,mode:'repeat'};
    project.generated=generateFence(project,state.models);
    const current=fenceKey(project.design,state.models);
    project.generated.key=JSON.stringify(JSON.parse(current).slice(0,2));
    expect(()=>sendFenceToJob(state,project,'')).toThrow(/aktuelnu verziju/);
    project.generated.key=current;
    expect(sendFenceToJob(state,project,'')).toBe('P-1070');
  });
});

