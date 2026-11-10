import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, Box, Check, CheckCircle2, ClipboardList, Download, Layers3, Lock, LockOpen, Maximize2, MousePointer2, Pencil, Plus, Redo2, RotateCw, Settings, Timer, TrendingUp, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activity, available, cutHours, dateAt, num, releaseReservation, sqm } from '../data/business';
import { download } from '../data/files';
import type { Job } from '../data/types';
import { writeDxf } from '../geometry/dxf';
import { fits, placement, sheetStats, type NestResult, type NestSettings, type Placement } from '../geometry/nesting';
import { pathData, translate, type Point } from '../geometry/polygon';
import { Button, Card, Donut, Empty, Field, Heading, NumberField, Table, TextLink, Thumbnail } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { JobSelect } from './Jobs';

export function Nesting() {
  const { id } = useParams();
  const { state } = useWorkshop();
  const job = id ? state.jobs.find(item=>item.id===id) : state.jobs.find(item=>item.nest && item.status!=='Završeno') ?? state.jobs[0];
  if (!job) return <><Heading icon={Layers3} title="Nesting" subtitle="Optimizacija rasporeda delova na tabli."/><Card><Empty>Izaberite posao za nesting. <TextLink to="/poslovi">Poslovi</TextLink></Empty></Card></>;
  return <NestEditor key={job.id} job={job}/>;
}
function NestEditor({ job }: { job: Job }) {
  const { state, save, notify } = useWorkshop();
  const navigate = useNavigate();
  const regularStock=state.inventory.find(s=>!s.remnant&&s.material===job.material&&s.thickness===job.thickness);
  const [settings,setSettings] = useState<NestSettings>(() => job.nest?.settings ?? {
    width:regularStock?.width??3000,height:regularStock?.height??1500,gap:5,margin:10,angles:[0,90],seconds:3,material:job.material,thickness:job.thickness,source:'new',remnants:[],
  });
  const [angles, setAngles] = useState(settings.angles.join(', '));
  const presets = ['3000×1500','2500×1250','4000×2000'];
  const [custom,setCustom] = useState(!presets.includes(settings.width+'×'+settings.height));
  const [rotation, setRotation] = useState(settings.angles.some(a=>a!==0));
  const [excluded,setExcluded] = useState(job.parts.filter(p=>p.excluded).map(p=>p.id));
  const [result,setResult] = useState(job.nest);
  const [past,setPast] = useState<(NestResult|undefined)[]>([]);
  const [future,setFuture] = useState<(NestResult|undefined)[]>([]);
  const [sheetIndex,setSheetIndex] = useState(0);
  const [active,setActive] = useState('');
  const [tab,setTab] = useState<'sheet'|'parts'|'stats'>('sheet');
  const [editing,setEditing] = useState(false);
  const [busy,setBusy] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [zoom,setZoom] = useState(1);
  const [pan,setPan] = useState<Point>({x:0,y:0});
  const [draft,setDraft] = useState<Placement>();
  const worker = useRef<Worker|null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ start:Point; part?:Placement; latest?:Placement } | null>(null);
  useEffect(()=>()=>worker.current?.terminate(),[]);
  const sheet = result?.sheets[sheetIndex];
  const activePart = sheet?.placements.find(p=>p.id===active);
  const stats = sheetStats(result?.sheets??[]);
  const current = sheetStats(sheet?[sheet]:[]);
  const included = job.parts.filter(p=>p.valid&&!excluded.includes(p.id));
  const invalid = job.parts.filter(p=>!p.valid&&!excluded.includes(p.id));
  const remnantRows = state.inventory.filter(stock=>stock.remnant&&stock.material===job.material&&stock.thickness===job.thickness)
    .map(stock=>({...stock,available:available(state,stock)+state.reservations.filter(r=>r.jobId===job.id&&r.stockId===stock.id).reduce((sum,r)=>sum+r.quantity,0)}))
    .filter(stock=>stock.available>0);
  const change = <K extends keyof NestSettings,>(key:K,value:NestSettings[K]) => setSettings(old=>({...old,[key]:value}));
  const fitView = () => {setZoom(1);setPan({x:0,y:0});};
  const setSheet = (index:number) => {setSheetIndex(index);setActive('');fitView();};
  const commit = (value:NestResult|undefined) => {
    setPast([...past,result]);setFuture([]);setResult(value);setDirty(true);
  };
  const undo = () => {if(past.length){setFuture([result,...future]);setResult(past.at(-1));setPast(past.slice(0,-1));setSheet(0);setDirty(true);}};
  const redo = () => {if(future.length){setPast([...past,result]);setResult(future[0]);setFuture(future.slice(1));setSheet(0);setDirty(true);}};
  const persist = async (value:NestResult|undefined, message:string) => {
    const ok=await save(data=>{
      const row=data.jobs.find(item=>item.id===job.id);
      if(!row)throw new Error('Posao više nije dostupan.');
      if(row.material!==job.material||row.thickness!==job.thickness||row.parts.length!==job.parts.length||row.parts.some((part,i)=>
        part.id!==job.parts[i]?.id||part.raw!==job.parts[i]?.raw||part.unit!==job.parts[i]?.unit||part.quantity!==job.parts[i]?.quantity))
        throw new Error('Delovi su promenjeni. Ponovo otvorite nesting.');
      const stockKey=(layout:NestResult|undefined)=>JSON.stringify(layout?.sheets.map(s=>[s.id,s.width,s.height,s.outline]).sort());
      if(stockKey(row.nest)!==stockKey(value) || value?.unplaced.length) releaseReservation(data,job.id);
      row.nest=value;row.nestingAt=value?dateAt():undefined;
      if(value){
        const ids=new Set([...value.sheets.flatMap(s=>s.placements.map(p=>p.partId)),...value.unplaced.map(id=>id.slice(0,id.lastIndexOf(':')))]);
        row.parts.forEach(part=>{part.excluded=!ids.has(part.id);});
      }
      data.calculations=data.calculations.filter(calc=>calc.jobId!==job.id);
      activity(data,'nest',(value?'Sačuvan nesting za posao ':'Uklonjen raspored za posao ')+job.id,'/nesting/'+job.id);
    },message);
    if(ok)setDirty(false);
    return ok;
  };
  const optimize = () => {
    if (busy) return;
    const raw = angles.trim().split(/[\s,;]+/).filter(Boolean).map(Number);
    if (rotation && (!raw.length || raw.some(angle=>!Number.isFinite(angle)) || raw.length>12)) {notify('Unesite do 12 uglova odvojenih zarezom.',true);return;}
    if (invalid.length) {notify('Isključite neispravne delove ili ispravite DXF geometriju.',true);return;}
    const next={...settings,angles:rotation?[...new Set(raw.map(n=>((n%360)+360)%360))]:[0],
      remnants:remnantRows.flatMap(stock=>Array.from({length:Math.min(500,stock.available)},(_,i)=>({
        id:stock.id+':'+i,width:stock.width,height:stock.height,outline:stock.outline,
      })))};
    const task=new Worker(new URL('../geometry/nesting.worker.ts',import.meta.url),{type:'module'});
    worker.current=task;setBusy(true);
    task.onmessage=async ({data}:{data:{result?:NestResult;error?:string}})=>{
      task.terminate();worker.current=null;
      if(data.result){commit(data.result);setSheet(0);setTab('sheet');await persist(data.result,'Optimizacija je završena i sačuvana.');}
      else notify(data.error??'Optimizacija nije uspela.',true);
      setBusy(false);
    };
    task.onerror=()=>{task.terminate();worker.current=null;setBusy(false);notify('Radnik za optimizaciju nije mogao da se pokrene.',true);};
    task.postMessage([included.map(p=>({id:p.id,name:p.name,quantity:p.quantity,shape:p.shape})),next,result]);
  };
  const width=sheet?.width??settings.width, height=sheet?.height??settings.height;
  const pad=Math.max(width,height)*.070;
  const vx=(width+pad*2)/zoom, vy=(height+pad*1.7)/zoom;
  const coords=(event:ReactPointerEvent<SVGSVGElement>)=>{
    const matrix=svg.current?.getScreenCTM();
    const pt=new DOMPoint(event.clientX,event.clientY);
    return matrix?pt.matrixTransform(matrix.inverse()):pt;
  };
  const updatePart=(p:Placement)=>{
    if(!result||!sheet)return;
    if(!fits(p,sheet,result.settings)){notify('Pozicija krši marginu ili razmak između delova.',true);return;}
    commit({...result,sheets:result.sheets.map((s,i)=>i===sheetIndex?{...s,placements:s.placements.map(other=>other.id===p.id?p:other)}:s)});
  };
  const pointerDown=(event:ReactPointerEvent<SVGSVGElement>)=>{
    if(busy)return;
    if(event.button!==0&&event.button!==1)return;
    const target=(event.target as SVGElement).closest('[data-part]')?.getAttribute('data-part');
    const part=sheet?.placements.find(p=>p.id===target);
    if(part)setActive(part.id);
    if(part&&!editing&&!event.altKey)return;
    if(part?.locked&&editing&&!event.altKey)return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current={start:coords(event),part:editing&&!event.altKey&&event.button===0?part:undefined};
  };
  const pointerMove=(event:ReactPointerEvent<SVGSVGElement>)=>{
    const move=gesture.current;if(!move)return;
    const pos=coords(event);
    const dx=pos.x-move.start.x,dy=pos.y-move.start.y;
    if(move.part){move.latest={...move.part,x:move.part.x+dx,y:move.part.y-dy};setDraft(move.latest);}
    else setPan(current=>({x:current.x+dx,y:current.y+dy}));
  };
  const end=(event:ReactPointerEvent<SVGSVGElement>)=>{
    if(event.type!=='pointercancel'&&gesture.current?.latest)updatePart(gesture.current.latest);
    gesture.current=null;setDraft(undefined);
  };
  const rotateActive=()=>{
    if(!activePart||!result||activePart.locked)return;
    const part=job.parts.find(p=>p.id===activePart.partId);
    if(!part)return;
    const choices=result.settings.angles;
    const angle=choices[(choices.indexOf(activePart.angle)+1)%choices.length];
    updatePart(placement(part,activePart.id,angle,activePart.x,activePart.y));
  };
  const exportSheet=()=>{
    if(!sheet)return;
    const rings=sheet.placements.flatMap(p=>translate(p.rings,p.x,p.y));
    download(writeDxf(rings),job.id+'-tabla-'+(sheetIndex+1)+'.dxf','application/dxf');
  };
  return <>
    <Heading icon={Layers3} title="Nesting" subtitle="Optimizacija rasporeda delova na tabli za maksimalnu iskorišćenost materijala i efikasno sečenje."/>
    <Card className="workflow-strip">
      <span><ClipboardList size={23}/> Posao: <JobSelect value={job.id} onChange={id=>navigate('/nesting/'+id)}/></span>
      <div className="workflow-steps"><Link to={'/poslovi/'+job.id}><i className="step done"><Check size={15}/></i> Uvoz fajlova</Link><b>⟶</b><span className="blue-text"><i className="step now">2</i> Nesting</span><b>⟶</b><Link to={'/kalkulacije/'+job.id}><i className="step">3</i> Kalkulacija</Link></div>
      <span className={dirty?'muted':'green-text'}>{result&&!dirty?<><CheckCircle2 size={16}/> Sačuvan raspored</>:dirty?'Nesačuvane izmene':'Priprema rasporeda'}</span>
    </Card>
    <div className="nest-layout">
      <div className="stack">
        <Card className="nest-parts" title={'DXF delovi ('+job.parts.length+')'} icon={ClipboardList} action={<Link to={'/poslovi/'+job.id} className="text-link"><Plus size={14}/> Dodaj fajlove</Link>}>
          <div className="part-list">{job.parts.map((part,i)=><label className={'part-tile '+(!excluded.includes(part.id)&&i===0?'highlight':'')} key={part.id}>
            <input type="checkbox" aria-label={'Uključi '+part.name} checked={!excluded.includes(part.id)} disabled={busy} onChange={e=>setExcluded(e.target.checked?excluded.filter(id=>id!==part.id):[...excluded,part.id])}/>
            <Thumbnail shape={part.shape} preview={part.preview}/><span><strong>{part.name}</strong><small>DXF · {part.material}</small><b>{part.quantity} kom</b><small>{num(part.shape.width)} × {num(part.shape.height)} mm</small></span><span className="thickness">{part.thickness} mm</span>
          </label>)}</div>
          {!job.parts.length&&<Empty>Dodajte DXF delove poslu.</Empty>}
        </Card>
        <Card className="total-parts"><Layers3/><div><small>Ukupno delova:</small><strong>{included.reduce((sum,p)=>sum+p.quantity,0)} kom</strong></div></Card>
      </div>
      <div className="stack nest-center">
        <Card className="nest-canvas-card">
          <div className="canvas-top"><div className="tabs" aria-label="Prikaz nestinga">
            {([['sheet','Raspored na tabli'],['parts','Pregled delova'],['stats','Statistika']] as const).map(([key,label])=><button type="button" className={tab===key?'active':''} onClick={()=>setTab(key)} key={key}>{label}</button>)}</div>
            {tab==='sheet'&&<div className="zoom-tools"><Button icon={ZoomOut} variant="bare" aria-label="Umanji" onClick={()=>setZoom(Math.max(.5,zoom/1.25))}/><Button icon={ZoomIn} variant="bare" aria-label="Uvećaj" onClick={()=>setZoom(Math.min(8,zoom*1.25))}/>
              <span>{num(zoom*100)} %</span><Button icon={Maximize2} variant="bare" aria-label="Prikaži celu tablu" onClick={fitView}/></div>}
          </div>
          {tab==='sheet'&&<>
            {(result?.sheets.length??0)>1&&<div className="sheet-tabs">{result!.sheets.map((s,i)=><button type="button" className={i===sheetIndex?'active':''} key={s.id??i} onClick={()=>setSheet(i)}>Tabla {i+1}{s.id?' · ostatak':''}</button>)}</div>}
            <div className={'canvas-wrap '+(editing?'editing':'')} onWheel={event=>{if(event.ctrlKey||event.metaKey)setZoom(z=>Math.min(8,Math.max(.5,z*(event.deltaY<0?1.13:.885))));}}>
              <svg ref={svg} className="nest-svg" role="img" aria-label="Raspored delova na tabli" viewBox={[(width-vx)/2-pan.x,(height-vy)/2-pan.y,vx,vy].join(' ')}
                onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={end} onPointerCancel={end}>
                <defs><pattern id="sheet-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#c3cbd5" strokeWidth=".6"/></pattern></defs>
                <g className="dimension" style={{fontSize:pad*.24}}>
                  <path d={'M0 '+(-pad*.39)+'H'+width+' M0 '+(-pad*.48)+'v'+(pad*.18)+' M'+width+' '+(-pad*.48)+'v'+(pad*.18)}/>
                  <text x={width/2} y={-pad*.56} textAnchor="middle">{width} mm</text>
                  <path d={'M'+(-pad*.36)+' 0V'+height+' M'+(-pad*.45)+' 0h'+(pad*.18)+' M'+(-pad*.45)+' '+height+'h'+(pad*.18)}/>
                  <text x={-height/2} y={-pad*.48} transform="rotate(-90)" textAnchor="middle">{height} mm</text>
                </g>
                <g transform={'translate(0 '+height+') scale(1 -1)'}>
                  {sheet?.outline ? <path className="sheet-boundary" d={pathData([sheet.outline])}/> : <rect className="sheet-boundary" width={width} height={height}/>}
                  {!sheet?.outline&&<rect width={width} height={height} fill="url(#sheet-grid)"/>}
                  {!sheet?.outline&&<rect className="sheet-margin" x={result?.settings.margin??settings.margin} y={result?.settings.margin??settings.margin}
                    width={Math.max(0,width-2*(result?.settings.margin??settings.margin))} height={Math.max(0,height-2*(result?.settings.margin??settings.margin))}/>}
                  {sheet?.placements.map(p=>{
                    const part=draft?.id===p.id?draft:p;
                    return <path key={p.id} data-part={p.id} tabIndex={editing?0:undefined} onKeyDown={event=>{
                      if(event.key==='Enter'||event.key===' '){event.preventDefault();setActive(p.id);}
                    }} className={'cut-part '+(p.id===active?'selected ':'')+(p.locked?'locked':'')} d={pathData(part.rings)}
                      fillRule="evenodd" transform={'translate('+part.x+' '+part.y+')'}><title>{job.parts.find(item=>item.id===p.partId)?.name} · {p.angle}°{p.locked?' · zaključan':''}</title></path>;
                  })}
                </g>
                {!sheet&&<text x={width/2} y={height/2} className="canvas-empty" style={{fontSize:pad*.24}} textAnchor="middle">{busy?'Izračunavanje rasporeda…':'Pokrenite optimizaciju rasporeda'}</text>}
              </svg>
            </div>
            <div className="canvas-legend"><span><i className="legend-part"/>Deo (sečenje)</span><span><i className="legend-sheet"/>Tabla ({width} × {height} mm)</span><span><i className="legend-gap"/>Razmak ({result?.settings.gap??settings.gap} mm)</span><span><i className="legend-margin"/>Margina ({result?.settings.margin??settings.margin} mm)</span></div>
            {editing&&<div className="edit-tools">
              <Button icon={MousePointer2} variant="bare" onClick={()=>setEditing(false)}>Završi uređivanje</Button>
              <Button icon={RotateCw} disabled={busy||!activePart||activePart.locked||(result?.settings.angles.length??0)<2} onClick={rotateActive}>Rotiraj</Button>
              <Button icon={activePart?.locked?LockOpen:Lock} disabled={busy||!activePart} onClick={()=>activePart&&updatePart({...activePart,locked:!activePart.locked})}>{activePart?.locked?'Otključaj':'Zaključaj'}</Button>
              <Button icon={Undo2} aria-label="Poništi" disabled={busy||!past.length} onClick={undo}/><Button icon={Redo2} aria-label="Ponovi" disabled={busy||!future.length} onClick={redo}/>
              <small>Prevucite deo. Za pomeranje prikaza držite Alt.</small>
            </div>}
          </>}
          {tab==='parts'&&<div className="parts-preview">{included.map(p=><div key={p.id}><Thumbnail shape={p.shape}/><strong>{p.name}</strong><small>{p.quantity} kom · {num(p.shape.width)} × {num(p.shape.height)} mm</small></div>)}</div>}
          {tab==='stats'&&<div className="canvas-stats"><Table head={['Tabla','Delovi','Površina','Otpad','Iskorišćenost']}>{result?.sheets.map((s,i)=>{
            const st=sheetStats([s]);return <tr key={i}><td>Tabla {i+1}</td><td>{st.count}</td><td>{sqm(st.total,3)}</td><td>{sqm(st.waste,3)}</td><td>{num(st.yield,1)} %</td></tr>;
          })}</Table>{!result?.sheets.length&&<Empty>Raspored još nije izračunat.</Empty>}</div>}
        </Card>
        <Card title="Raspored delova na tabli" icon={Box}>
          <Table head={['#','Naziv dela','Količina','Dimenzije (mm)','Površina po kom.','Ukupna površina','Raspored']}>{included.map((p,i)=>{
            const placed=result?.sheets.flatMap(s=>s.placements).filter(a=>a.partId===p.id).length??0;
            return <tr key={p.id}><td>{i+1}</td><td className="part-name"><Thumbnail shape={p.shape}/><strong>{p.name}</strong></td><td>{p.quantity} kom</td><td>{num(p.shape.width)} × {num(p.shape.height)}</td>
              <td>{sqm(p.shape.area,3)}</td><td>{sqm(p.shape.area*p.quantity,3)}</td><td><span className={'badge '+(placed===p.quantity?'green':'amber')}>{placed===p.quantity&&<Check size={13}/>} {placed}/{p.quantity}</span></td></tr>;
          })}</Table>
        </Card>
      </div>
      <div className="stack">
        <Card title="Podešavanja nesting-a" icon={Settings} className="nest-settings">
          <div className="compact-fields">
            <Field label="Materijal"><input readOnly value={job.material}/></Field><Field label="Debljina"><input readOnly value={job.thickness+' mm'}/></Field>
            <Field label="Dimenzije table"><select value={custom?'custom':settings.width+'×'+settings.height} onChange={e=>{
              const value=e.target.value;
              setCustom(value==='custom');
              if(value==='custom')return;
              const [w,h]=value.split('×').map(Number);setSettings({...settings,width:w,height:h});
            }}><option value="3000×1500">3000 × 1500 mm</option><option value="2500×1250">2500 × 1250 mm</option><option value="4000×2000">4000 × 2000 mm</option><option value="custom">Prilagođeno</option></select></Field>
            {custom&&<><Field label="Širina (mm)"><NumberField label="Širina table" min={1} max={30000} value={settings.width} onChange={v=>change('width',v)}/></Field><Field label="Visina (mm)"><NumberField label="Visina table" min={1} max={30000} value={settings.height} onChange={v=>change('height',v)}/></Field></>}
            <Field label="Razmak između delova"><NumberField label="Razmak između delova" max={500} value={settings.gap} onChange={v=>change('gap',v)}/></Field>
            <Field label="Margina table"><NumberField label="Margina table" max={500} value={settings.margin} onChange={v=>change('margin',v)}/></Field>
          </div>
          <details className="nest-advanced"><summary>Napredna podešavanja</summary><div className="compact-fields">
            <Field label="Dozvoli rotaciju"><input type="checkbox" checked={rotation} onChange={e=>setRotation(e.target.checked)}/></Field>
            <Field label="Uglovi (°)"><input disabled={!rotation} value={angles} onChange={e=>setAngles(e.target.value)}/></Field>
            <Field label="Izvor materijala"><select value={settings.source} onChange={e=>change('source',e.target.value as NestSettings['source'])}><option value="new">Nove table</option><option value="remnant">Ostaci ({remnantRows.length})</option><option value="mixed">Table i ostaci</option></select></Field>
            <Field label="Vreme (s)"><NumberField label="Vreme optimizacije" min={1} max={60} value={settings.seconds} onChange={v=>change('seconds',v)}/></Field>
          </div></details>
        </Card>
        <Card title="Rezultat nesting-a" icon={TrendingUp} className="nest-results">
          <div className="nest-yield"><Donut value={stats.yield}/><div><span><i className="area-green"/>Površina delova<strong>{sqm(stats.area,3)}</strong></span>
            <span><i className="area-grey"/>Otpad<strong>{sqm(stats.waste,3)}</strong></span><span>Ukupna površina<strong>{sqm(stats.total,3)}</strong></span></div></div>
          <dl className="summary-list"><div><dt><TrendingUp/>Iskorišćenost materijala</dt><dd><span className="badge green">{num(stats.yield,1)} %</span></dd></div>
            <div><dt><Layers3/>Broj tabli</dt><dd>{result?.sheets.length??0} kom</dd></div><div><dt><Box/>Raspoređeno / ostalo</dt><dd>{stats.count} / {result?.unplaced.length??0} kom</dd></div>
            <div><dt><Timer/>Procena sečenja</dt><dd>{num(cutHours(stats.length,stats.pierces,state.settings)*60,1)} min</dd></div>
            {sheet&&<div><dt>Iskorišćenost table {sheetIndex+1}</dt><dd>{num(current.yield,1)} %</dd></div>}</dl>
          <Button icon={RotateCw} variant="primary" disabled={busy||!included.length} validateNumbers onClick={optimize}>{busy?'Optimizacija…':result?'Optimizuj ponovo':'Optimizuj raspored'}</Button>
          {busy&&<Button onClick={()=>{worker.current?.terminate();worker.current=null;setBusy(false);}}>Prekini optimizaciju</Button>}
          <div className="nest-result-actions"><Button icon={Pencil} disabled={!sheet||busy} aria-pressed={editing} onClick={()=>{setTab('sheet');setEditing(!editing);}}>Ručno uredi</Button><Button icon={Download} disabled={!sheet||busy} onClick={exportSheet}>Izvezi DXF</Button></div>
          {dirty&&<Button disabled={busy} onClick={()=>void persist(result,'Raspored je sačuvan.')}>Sačuvaj raspored</Button>}
          {result&&<Link className="text-link nest-next" to={'/kalkulacije/'+job.id}>Nastavi na kalkulaciju <ArrowRight size={16}/></Link>}
        </Card>
      </div>
    </div>
  </>;
}

