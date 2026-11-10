import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Grid3X3, Maximize2, Move, Ruler, ZoomIn, ZoomOut } from 'lucide-react';
import { num } from '../data/business';
import { pathData } from '../geometry/polygon';
import { Button, Card } from '../ui/common';
import { concreteOutline } from './concrete';
import { segmentName } from './layout';
import type { FenceAnalysis } from './panels';

export type Selection = { kind: 'post'; id: string } | { kind: 'segment'; id: string; leaf?: number } | null;
export const mm = (n: number) => n.toLocaleString('sr-Latn-RS', { maximumFractionDigits: 3 }) + ' mm';

function Dimension({ x, y, length, vertical, label, units, onSelect }: {
  x: number; y: number; length: number; vertical?: boolean; label: string; units: number; onSelect: () => void;
}) {
  const narrow = !vertical && length < units * (label.length * 7 + 12);
  const height = units * 5;
  return <g className="fence-dim" transform={'translate('+x+' '+y+')'+(vertical?' rotate(-90)':'')} role="button"
    tabIndex={0} aria-label={label} onClick={onSelect} onKeyDown={activate(onSelect)}>
    <rect x={0} y={-units * (narrow ? 55 : 23)} width={length} height={units * (narrow ? 66 : 35)} fill="transparent" stroke="none"/>
    <path d={'M0 0H'+length+' M0 '+(-height)+'V'+height+' M'+length+' '+(-height)+'V'+height}/>
    <text x={narrow ? 0 : length / 2} y={narrow ? 0 : -units * 7} fontSize={units*12} textAnchor={narrow?'start':'middle'}
      transform={narrow ? 'translate('+length/2+' '+(-units*6)+') rotate(-90)' : undefined}>{narrow?label.replace(' mm',''):label}</text>
  </g>;
}
function activate(action: () => void) {
  return (event: KeyboardEvent<SVGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
  };
}

export function FenceCanvas({ analysis, selection, select, editLength, frame }: {
  analysis: FenceAnalysis; selection: Selection; select: (value: Selection) => void; editLength: () => void; frame: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 840, height: 450 });
  const [panMode, setPanMode] = useState(false);
  const [dimensions, setDimensions] = useState(true);
  const [grid, setGrid] = useState(true);
  const canvas = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; offset: typeof offset; moved: boolean } | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  const fit = Math.min(Math.max(10, size.width - 132) / Math.max(1, analysis.length), Math.max(10, size.height - 150) / Math.max(1, analysis.height));
  const scale = fit * zoom;
  const units = 1 / scale;
  const width = size.width * units, height = size.height * units;
  const x = (analysis.length - width) / 2 - offset.x, y = (-analysis.height - height) / 2 - offset.y;
  const gridStep = Math.max(50, 10 ** Math.round(Math.log10(units * 20)));
  const concrete = concreteOutline(analysis);
  const reset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const zoomBy = (factor: number) => setZoom(value => Math.min(8, Math.max(.55, value * factor)));
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as SVGElement;
    if (!panMode && !event.altKey && event.button === 0 && target.closest('[role=button], [data-fence-hit]')) return;
    drag.current = { x: event.clientX, y: event.clientY, offset, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !active.moved) return;
    active.moved = true;
    setOffset({ x: active.offset.x + dx * units, y: active.offset.y + dy * units });
  };
  const stop = () => {
    if (drag.current && !drag.current.moved && !panMode) select(null);
    drag.current = null;
  };
  const click = (action: () => void) => (event: React.MouseEvent<SVGElement>) => {
    if (panMode || event.altKey) return;
    event.stopPropagation();
    action();
  };

  return <Card className="fence-canvas">
    <div className="fence-canvas-toolbar">
      <div><strong>Pogled spreda</strong><small>Ravna trasa · milimetri</small></div>
      <div className="inline-actions wrap">
        <Button icon={Ruler} variant="bare" aria-label="Prikaži kote" aria-pressed={dimensions} onClick={() => setDimensions(!dimensions)}/>
        <Button icon={Grid3X3} variant="bare" aria-label="Prikaži mrežu" aria-pressed={grid} onClick={() => setGrid(!grid)}/>
        <Button icon={Move} variant="bare" aria-label="Pomeranje prikaza" aria-pressed={panMode} onClick={() => setPanMode(!panMode)}/>
        <div className="zoom-tools"><Button icon={ZoomOut} variant="bare" aria-label="Umanji prikaz ograde" onClick={() => zoomBy(.8)}/>
          <span>{num(zoom * 100)} %</span><Button icon={ZoomIn} variant="bare" aria-label="Uvećaj prikaz ograde" onClick={() => zoomBy(1.25)}/>
          <Button icon={Maximize2} variant="bare" aria-label="Prikaži celu ogradu" onClick={reset}/></div>
      </div>
    </div>
    <svg ref={canvas} className={'fence-svg '+(panMode?'pan-mode':'')} aria-label="2D prikaz ograde" viewBox={[x, y, width, height].join(' ')}
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={() => { drag.current = null; }}
      onWheel={event => { if (event.altKey) zoomBy(event.deltaY < 0 ? 1.15 : .87); }}>
      <defs>
        <pattern id="fence-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
          <path d={'M'+gridStep+' 0H0V'+gridStep} fill="none" stroke="#d8e4ef" strokeWidth={units*.75}/>
        </pattern>
      </defs>
      {grid && <rect x={x} y={y} width={width} height={height} fill="url(#fence-grid)"/>}
      {analysis.posts.length>0
        ? <path className="fence-ground" d={'M'+(-units*20)+' 0H'+(analysis.length + units * 20)}/>
        : <text className="fence-annotation" x={x+width/2} y={y+height/2} fontSize={units*14} textAnchor="middle">Dodajte stub, segment ili kapiju.</text>}
      {analysis.spans.map(span => {
        const selected = selection?.kind === 'segment' && selection.id === span.segment.id;
        const choose = (leaf?: number) => () => select({ kind: 'segment', id: span.segment.id, leaf });
        return <g key={span.segment.id}>
          <rect data-fence-hit x={span.x} y={-span.top} width={span.width} height={span.top} fill={selected?'#0d72ea15':'transparent'}
            stroke={selected?'#0874ed':'transparent'} vectorEffect="non-scaling-stroke" onClick={click(choose())} style={{cursor:'pointer'}}/>
          {span.leaves.map(leaf => {
            const shape = leaf.panel.shape;
            const panelX = leaf.x + (leaf.width - (shape?.width ?? leaf.width)) / 2;
            const panelY = -leaf.ground - (leaf.height - (shape?.height ?? leaf.height)) / 2;
            const active = selected && (selection.leaf === undefined || selection.leaf === leaf.leaf);
            return <g key={leaf.leaf} role="button" tabIndex={0} aria-label={leaf.name+' · prikaz'} aria-pressed={active}
              className={'fence-leaf '+(active?'selected ':'')+(leaf.panel.error?'invalid':'')} onClick={click(choose(leaf.leaf))} onKeyDown={activate(choose(leaf.leaf))}>
              <rect x={leaf.x} y={-leaf.ground - Math.max(0,leaf.height)} width={Math.max(0,leaf.width)} height={Math.max(0,leaf.height)} className="fence-leaf-box"/>
              {frame > 0 && leaf.cutWidth > 0 && leaf.cutHeight > 0 && <path fillRule="evenodd" className="fence-frame"
                d={'M'+leaf.x+' '+(-leaf.ground-leaf.height)+'h'+leaf.width+'v'+leaf.height+'h'+(-leaf.width)+'Z M'+
                  (leaf.x+frame)+' '+(-leaf.ground-leaf.height+frame)+'h'+leaf.cutWidth+'v'+leaf.cutHeight+'h'+(-leaf.cutWidth)+'Z'}/>}
              {shape && <path d={pathData(shape.rings)} transform={'translate('+panelX+' '+panelY+') scale(1 -1)'} fillRule="evenodd" className="fence-metal"/>}
              <title>{leaf.name+' · '+(leaf.panel.error ?? (mm(shape!.width)+' × '+mm(shape!.height)))}</title>
            </g>;
          })}
          <text className="fence-annotation" x={span.x+span.width/2} y={-span.top-units*11} fontSize={units*11} textAnchor="middle">
            {span.width / units > 52 ? segmentName(span.segment,span.index) : span.index+1}
          </text>
          {dimensions && <Dimension x={span.x} y={-analysis.height-units*30} length={span.width} units={units} label={mm(span.width)} onSelect={choose()}/>}
        </g>;
      })}
      {concrete && <path className="fence-concrete" d={concrete}/>}
      {analysis.posts.map((post, index) => {
        const selected = selection?.kind === 'post' && selection.id === post.id;
        const choose = () => select({ kind:'post', id: post.id });
        return <g key={post.id} role="button" tabIndex={0} aria-label={'Stub '+(index+1)+' · prikaz'} aria-pressed={selected}
          className={'fence-post '+post.type+(selected?' selected':'')} onClick={click(choose)} onKeyDown={activate(choose)}>
          <rect x={post.x - Math.max(0,(units*14-post.width)/2)} y={-post.height} width={Math.max(post.width,units*14)} height={post.height} fill="transparent"/>
          {post.type!=='concrete'&&<rect className="fence-post-body" x={post.x} y={-post.height} width={post.width} height={post.height}/>}
          <text className="fence-annotation" x={post.axis} y={units*16} fontSize={units*10} textAnchor="middle">{index+1}</text>
          <title>{'Stub '+(index+1)+' · '+mm(post.width)+' × '+mm(post.height)}</title>
        </g>;
      })}
      {dimensions && analysis.spans.length>0 && <>
        <Dimension x={0} y={units*43} length={analysis.length} units={units} label={mm(analysis.length)+' ukupno'} onSelect={editLength}/>
        <Dimension x={-units*35} y={0} length={analysis.fenceHeight} units={units} label={mm(analysis.fenceHeight)+' visina'} vertical onSelect={() => select(null)}/>
      </>}
    </svg>
    <div className="fence-canvas-footer"><span><i/> Limeni panel</span><span><i/> Stub / profil</span>
      {concrete&&<span className="fence-concrete-key"><i/> Beton</span>}<span>Prevucite pozadinu za pomeranje prikaza.</span>
    </div>
  </Card>;
}

