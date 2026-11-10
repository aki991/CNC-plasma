import { describe, expect, it } from 'vitest';
import { newFence } from '../src/fence/layout';
import { analyzeFence, generateFence } from '../src/fence/panels';
import { defaultVoronoi, voronoiPanel } from '../src/fence/voronoi';
import { parseDxf } from '../src/geometry/dxf';
import { bounds, edges, inside, segmentDistance, selfIntersects } from '../src/geometry/polygon';

const settings={...defaultVoronoi,frame:35,web:14,rounding:60,seed:2468};

describe('Voronoi ispuna',()=>{
  it('recalculates all 68 cells for the new dimensions and exports the exact preview contours in millimeters',()=>{
    const project=newFence();
    project.design.height=1080;
    project.design.segments[0].width=2020;
    project.design.segments[0].panels[0]={modelId:'',mode:'voronoi',voronoi:settings};
    const initial=analyzeFence(project.design,[]).spans[0].leaves[0].panel.shape!;
    expect(initial).toMatchObject({width:2000,height:1000});
    expect(initial.depths).toEqual([0,...Array(68).fill(1)]);

    project.design.height=1200;
    project.design.segments[0].width=1800;
    const preview=analyzeFence(project.design,[]).spans[0].leaves[0].panel.shape!;
    const output=generateFence(project,[]);
    const result=parseDxf(output.parts[0].raw);
    expect(result).toMatchObject({valid:true,unit:4,shape:{width:1780,height:1120}});
    expect(result.shape.rings).toEqual(preview.rings);
    expect(result.shape.rings).toHaveLength(69);
    expect(result.shape.depths).toEqual([0,...Array(68).fill(1)]);
    expect(preview.rings[1]).not.toEqual(initial.rings[1]);
    // Some cells cross the center in both directions because the panel is generated as one field.
    const openings=preview.rings.slice(1).map(ring=>bounds([ring]));
    expect(openings.filter(box=>box.minX<890 && box.maxX>890).length).toBeGreaterThan(3);
    expect(openings.filter(box=>box.minY<560 && box.maxY>560).length).toBeGreaterThan(5);
  });

  it('preserves the true frame and web clearances after rounding',()=>{
    const width=1780,height=1120;
    const shape=voronoiPanel(width,height,settings);
    const cuts=shape.rings.slice(1).map(ring=>({ring,box:bounds([ring]),segments:edges(ring)}));
    const angular=voronoiPanel(width,height,{...settings,rounding:0});
    expect(shape.rings.flat().length).toBeGreaterThan(angular.rings.flat().length);
    expect(shape.area).toBeGreaterThan(angular.area);
    for (const [index,a] of cuts.entries()) {
      expect(selfIntersects(a.ring)).toBe(false);
      expect(Math.min(a.box.minX,a.box.minY,width-a.box.maxX,height-a.box.maxY)).toBeGreaterThanOrEqual(settings.frame);
      for (const b of cuts.slice(0,index)) {
        const dx=Math.max(0,a.box.minX-b.box.maxX,b.box.minX-a.box.maxX);
        const dy=Math.max(0,a.box.minY-b.box.maxY,b.box.minY-a.box.maxY);
        if (Math.hypot(dx,dy)>=settings.web) continue;
        expect(inside(a.ring[0],b.ring)||inside(b.ring[0],a.ring)).toBe(false);
        const tooClose=a.segments.some(([p,q])=>b.segments.some(([r,s])=>segmentDistance(p,q,r,s)<settings.web));
        expect(tooClose).toBe(false);
      }
    }
  });

  it('reproduces a saved seed and uses different contours for a new seed',()=>{
    const shape=voronoiPanel(2000,1000,settings);
    expect(voronoiPanel(2000,1000,JSON.parse(JSON.stringify(settings)))).toEqual(shape);
    const variant=voronoiPanel(2000,1000,{...settings,seed:2469});
    expect(variant.rings).not.toEqual(shape.rings);
    expect(variant).toMatchObject({width:shape.width,height:shape.height,depths:shape.depths});
  });

  it('blocks a frame that consumes the panel and excessive cell density',()=>{
    expect(()=>voronoiPanel(1780,1120,{...settings,frame:600})).toThrow('Ram je preširok');
    expect(()=>voronoiPanel(100,100,{...settings,openings:200})).toThrow('otvora je premalo ili neispravno');
    const project=newFence();
    project.design.segments[0].panels[0]={modelId:'',mode:'voronoi',voronoi:{...settings,frame:600}};
    expect(()=>generateFence(project,[])).toThrow('Ram je preširok');
  });
});

