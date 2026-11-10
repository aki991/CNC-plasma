import { useState } from 'react';
import { ArrowDown, ArrowUp, FileType, Lock, RefreshCw, Settings2, Unlock, WandSparkles } from 'lucide-react';
import type { Customer, Model } from '../data/types';
import { Button, Card, Dialog, Empty, Field, NumberField, Thumbnail } from '../ui/common';
import { searchKey } from '../ui/shell';
import { MaterialSelect } from '../pages/Jobs';
import { mm, type Selection } from './Canvas';
import { MAX_SPAN, MIN_SPAN, moveSegment, postHeight, postWidth, segmentName } from './layout';
import { defaultOpening, isParametric, isRepeatable, minimumBorder, minimumBridge, newVoronoiChoice, type FenceAnalysis } from './panels';
import type { FenceDesign, PanelChoice, Post, Segment } from './types';
import { defaultVoronoi, maxVoronoiOpenings, newVoronoiSeed, type VoronoiSettings } from './voronoi';

export type EditDesign = (apply: (design: FenceDesign) => FenceDesign, group?: string) => void;
export type PanelTarget = { id: string; leaf: number };
const postTypes: [FenceDesign['postType'], string][] = [['steel','Čelični profil'],['aluminum','Aluminijumski profil'],['concrete','Betonski stub']];
export const kindLabels: Record<Segment['kind'], string> = { panel:'Segment ograde', single:'Jednokrilna kapija', double:'Dvokrilna kapija' };
const modes = [['repeat','Popuni ponavljanjem otvora'], ['fixed','Fiksni šablon'], ['proportional','Proporcionalno skaliranje'], ['parametric','Parametarski šablon']] as const;

export function Measure({ label, value, set, min = 0, max = 12000, integer }: {
  label: string; value: number; set: (value: number) => void; min?: number; max?: number; integer?: boolean;
}) {
  return <Field label={label}><NumberField label={label} value={value} min={min} max={max} step={integer?1:'any'} onChange={value=>set(integer?Math.round(value):value)}/></Field>;
}

export function FenceInspector({ design, analysis, customers, models, selection, select, edit, pick, resize, count }: {
  design: FenceDesign; analysis: FenceAnalysis; customers: Customer[]; models: Model[]; selection: Selection; select: (value: Selection) => void;
  edit: EditDesign; pick: (value: PanelTarget) => void; resize: () => void; count: () => void;
}) {
  const update = <K extends keyof FenceDesign,>(key: K, value: FenceDesign[K]) =>
    edit(current=>({...current,[key]:value}), 'project.'+key);
  const postIndex = selection?.kind === 'post' ? design.posts.findIndex(post=>post.id===selection.id) : -1;
  const spanIndex = selection?.kind === 'segment' ? design.segments.findIndex(segment=>segment.id===selection.id) : -1;

  if (postIndex >= 0) {
    const post = design.posts[postIndex];
    const updatePost = (patch: Partial<Post>, group?: string) => edit(current => ({
      ...current, posts: current.posts.map(item => item.id===post.id ? {...item,...patch} : item),
    }), group && post.id + '.' + group);
    return <Card title={'Stub '+(postIndex+1)} icon={Settings2} className="fence-inspector">
      <div className="fence-inspector-fields">
        <Field label="Tip stuba"><select value={post.type??''} onChange={e=>updatePost({type:e.target.value as Post['type']||undefined})}>
          <option value="">Prema projektu</option>{postTypes.map(([id,label])=><option value={id} key={id}>{label}</option>)}
        </select></Field>
        <Measure label="Širina stuba (mm)" value={postWidth(design,post)} min={20} max={2000} set={width=>updatePost({width},'width')}/>
        <Measure label="Visina stuba (mm)" value={postHeight(design,post,postIndex)} min={50} max={8000} set={height=>updatePost({height},'height')}/>
        <div className="fence-readout"><span>Osa od početka trase</span><strong>{mm(analysis.posts[postIndex].axis)}</strong></div>
        <Button disabled={post.type===undefined&&post.width===undefined&&post.height===undefined} onClick={()=>updatePost({type:undefined,width:undefined,height:undefined})}>Vrati mere projekta</Button>
      </div>
    </Card>;
  }

  if (spanIndex >= 0) {
    const span = analysis.spans[spanIndex], segment = span.segment;
    const leafIndex = selection?.kind==='segment'&&segment.kind==='double' ? selection.leaf??0 : 0;
    const leaf = span.leaves[leafIndex];
    const choice = leaf.choice;
    const target = {id:segment.id,leaf:leafIndex};
    const sideGap = segment.sideGap??design.sideGap;
    const isVoronoi = choice.mode==='voronoi';
    const repeatable = isRepeatable(models.find(model=>model.id===choice.modelId));
    const updateSegment = (patch: Partial<Segment>, group?: string) => edit(current => ({
      ...current, segments: current.segments.map(item => item.id===segment.id ? {...item,...patch} : item),
    }), group && segment.id + '.' + group);
    const setChoice = (patch: Partial<PanelChoice>, key?: string) => edit(current=>setPanel(current,target,{...choice,...patch}),
      key&&segment.id+'.'+leafIndex+'.'+key);
    const voronoi = choice.voronoi??defaultVoronoi;
    const setVoronoi = (key: keyof VoronoiSettings, value: number) =>
      setChoice({voronoi:{...voronoi,[key]:value}},key==='seed'?undefined:'voronoi.'+key);
    return <Card title={segmentName(segment,spanIndex)} icon={Settings2} className="fence-inspector">
      <div className="fence-inspector-fields">
        <Field label="Vrsta elementa"><select value={segment.kind} onChange={e=>updateSegment({kind:e.target.value as Segment['kind']})}>
          {Object.entries(kindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></Field>
        <Measure label="Svetla širina (mm)" min={MIN_SPAN} max={MAX_SPAN} value={span.width} set={width=>updateSegment({width,locked:true},'width')}/>
        <Button icon={segment.locked?Lock:Unlock} aria-pressed={segment.locked} onClick={()=>updateSegment({locked:!segment.locked})}>
          {segment.locked?'Širina je zaključana':'Zaključaj širinu'}
        </Button>
        <div className="form-grid two">
          <Measure label="Visina (mm)" min={50} max={8000} value={span.top} set={top=>updateSegment({top},'top')}/>
          <Measure label={span.plinthHeight>0?'Od podnožja (mm)':'Od tla (mm)'} max={3000} value={span.ground} set={ground=>updateSegment({ground},'ground')}/>
        </div>
        <Measure label="Bočni zazor po strani (mm)" max={500} value={sideGap} set={sideGap=>updateSegment({sideGap},'sideGap')}/>
        {segment.kind==='double'&&<>
          <Measure label="Zazor između krila (mm)" max={500} value={segment.meetingGap??design.meetingGap} set={meetingGap=>updateSegment({meetingGap},'meetingGap')}/>
          <Measure label="Širina levog krila (mm)" min={1} value={span.leaves[0].width>0?span.leaves[0].width:1} set={leftLeaf=>updateSegment({leftLeaf},'leftLeaf')}/>
          <Button disabled={segment.leftLeaf===undefined} onClick={()=>updateSegment({leftLeaf:undefined})}>Podeli na jednaka krila</Button>
        </>}
        {(segment.top!==undefined||segment.ground!==undefined||segment.sideGap!==undefined||segment.meetingGap!==undefined)&&
          <Button variant="bare" onClick={()=>updateSegment({top:undefined,ground:undefined,sideGap:undefined,meetingGap:undefined})}>Primeni visinu i zazore projekta</Button>}
        {segment.kind==='panel'&&<>
          <Measure label="Visina podnožja segmenta (mm)" max={8000} value={span.plinthHeight} set={plinthHeight=>updateSegment({plinthHeight},'plinthHeight')}/>
          {segment.plinthHeight!==undefined&&<Button variant="bare" onClick={()=>updateSegment({plinthHeight:undefined})}>Primeni visinu podnožja projekta</Button>}
        </>}
        <div className="fence-inspector-divider"><strong>Ispuna</strong></div>
        {segment.kind==='double'&&<div className="toggle-segment fence-leaf-tabs">
          {['Levo krilo','Desno krilo'].map((text, i)=><button key={i} type="button" className={leafIndex===i?'active':''} aria-pressed={leafIndex===i}
            onClick={()=>select({kind:'segment',id:segment.id,leaf:i})}>{text}</button>)}
        </div>}
        <Button icon={FileType} onClick={()=>pick(target)}>{leaf.panel.name} · Promeni</Button>
        {!isVoronoi&&<div className="fence-voronoi-choice">
          {leaf.panel.mode==='repeat'&&<small className="muted">Trenutni režim ponavlja otvore iz DXF šablona.</small>}
          <Button icon={WandSparkles} variant="primary" onClick={()=>edit(current=>setPanel(current,target,newVoronoiChoice()))}>Prebaci na Voronoi</Button>
          <small className="muted">Generiše novu šaru preko cele mere lima.</small>
        </div>}
        {choice.modelId&&<Field label="Režim šablona"><select value={leaf.panel.mode} onChange={e=>{
          const mode=e.target.value as PanelChoice['mode'];
          setChoice({mode,fixedSize:mode==='fixed'?true:undefined});
        }}>
          {modes.filter(([id])=>(id!=='parametric'||isParametric(choice.modelId))&&(id!=='repeat'||repeatable||leaf.panel.mode==='repeat'))
            .map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select></Field>}
        {choice.modelId&&choice.mode==='parametric'&&isParametric(choice.modelId)&&<>
          <Measure label="Veličina otvora (mm)" min={4} max={1000} value={choice.opening??defaultOpening(choice.modelId)} set={opening=>setChoice({opening},'opening')}/>
          <div className="form-grid two">
            <Measure label="Most (mm)" min={minimumBridge(design.thickness)} max={300} value={choice.bridge??minimumBridge(design.thickness)} set={bridge=>setChoice({bridge},'bridge')}/>
            <Measure label="Obod (mm)" min={minimumBorder(design.thickness)} max={300} value={choice.border??minimumBorder(design.thickness)} set={border=>setChoice({border},'border')}/>
          </div>
        </>}
        {isVoronoi&&<>
          <div className="form-grid two">
            <Measure label="Širina rama (mm)" min={.1} value={voronoi.frame} set={v=>setVoronoi('frame',v)}/>
            <Measure label="Minimalna širina lima (mm)" min={.1} value={voronoi.web} set={v=>setVoronoi('web',v)}/>
            <Measure label="Broj otvora" min={1} max={maxVoronoiOpenings} integer value={voronoi.openings} set={v=>setVoronoi('openings',v)}/>
            <Measure label="Zaobljenje (%)" max={100} value={voronoi.rounding} set={v=>setVoronoi('rounding',v)}/>
          </div>
          <small className="muted">Ram se meri od ivice lima, a minimalna širina lima između kontura susednih otvora.</small>
          <Button icon={RefreshCw} onClick={()=>setVoronoi('seed',newVoronoiSeed(voronoi.seed))}>Nova varijanta</Button>
        </>}
        <div className="fence-readout"><span>Mera lima za sečenje</span><strong>{mm(leaf.cutWidth)} × {mm(leaf.cutHeight)}</strong></div>
        {segment.kind!=='double'&&(sideGap>0||leaf.ground>0||design.topGap>0||design.frame>0)&&<small className="muted">
          Širina između stubova {mm(span.width)} umanjena je za {mm(2*sideGap+2*design.frame)}.
          Visina od tla {mm(span.top)} umanjena je za {mm(leaf.ground+design.topGap+2*design.frame)}.
        </small>}
        {leaf.panel.shape&&(Math.abs(leaf.panel.shape.width-leaf.cutWidth)>.005||Math.abs(leaf.panel.shape.height-leaf.cutHeight)>.005)&&
          <div className="fence-readout"><span>Mera DXF-a</span><strong>{mm(leaf.panel.shape.width)} × {mm(leaf.panel.shape.height)}</strong></div>}
        {leaf.panel.mode==='repeat'&&leaf.panel.shape&&<div className="fence-readout">
          <span>Otvori iz šablona</span><strong>{leaf.panel.shape.rings.length-1}</strong>
        </div>}
        {leaf.panel.error&&<p className="fence-issue error-text">{leaf.panel.error}</p>}
        {leaf.panel.warning&&<p className="fence-issue muted">{leaf.panel.warning}</p>}
        <div className="inline-actions wrap">
          <Button icon={ArrowUp} aria-label="Pomeri segment ulevo" disabled={spanIndex===0} onClick={()=>edit(current=>moveSegment(current,spanIndex,-1))}/>
          <Button icon={ArrowDown} aria-label="Pomeri segment udesno" disabled={spanIndex===design.segments.length-1} onClick={()=>edit(current=>moveSegment(current,spanIndex,1))}/>
        </div>
      </div>
    </Card>;
  }

  return <Card title="Parametri projekta" icon={Settings2} className="fence-inspector">
    <div className="fence-inspector-fields">
      <Field label="Naziv projekta"><input value={design.name} maxLength={120} onChange={e=>update('name',e.target.value)}/></Field>
      <Field label="Kupac ograde"><select value={design.customerId} onChange={e=>update('customerId',e.target.value)}>
        <option value="">Izaberi kupca</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
      </select></Field>
      <div className="fence-readout"><span>Ukupna dužina</span><strong>{mm(analysis.length)}</strong></div>
      <div className="inline-actions wrap"><Button disabled={!design.segments.length} onClick={resize}>Promeni dužinu</Button><Button onClick={count}>{design.segments.length} seg. · {design.posts.length} stub.</Button></div>
      <div className="form-grid two">
        <Measure label="Visina ograde (mm)" min={50} max={8000} value={design.height} set={v=>update('height',v)}/>
        <Measure label="Donji zazor (mm)" max={3000} value={design.ground} set={v=>update('ground',v)}/>
        <Measure label="Bočni zazor (mm)" max={500} value={design.sideGap} set={v=>update('sideGap',v)}/>
        <Measure label="Gornji zazor (mm)" max={500} value={design.topGap} set={v=>update('topGap',v)}/>
        <Measure label="Ram po ivici (mm)" max={500} value={design.frame} set={v=>update('frame',v)}/>
        <Measure label="Zazor krila (mm)" max={500} value={design.meetingGap} set={v=>update('meetingGap',v)}/>
      </div>
      <div className="fence-inspector-divider"><strong>Stubovi</strong></div>
      <Field label="Podrazumevani tip"><select value={design.postType} onChange={e=>update('postType',e.target.value as FenceDesign['postType'])}>
        {postTypes.map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select></Field>
      <div className="form-grid two">
        <Measure label="Širina stubova (mm)" min={20} max={2000} value={design.postWidth} set={v=>update('postWidth',v)}/>
        <Measure label="Nadvišenje (mm)" max={2000} value={design.postHeight} set={v=>update('postHeight',v)}/>
      </div>
      <div className="fence-inspector-divider"><strong>Betonsko podnožje</strong></div>
      <Measure label="Visina podnožja (mm)" max={8000} value={design.plinthHeight??0} set={v=>update('plinthHeight',v||undefined)}/>
      <small className="muted">Visina 0 isključuje podnožje. Donji zazor se meri od vrha podnožja, odnosno od tla u poljima bez podnožja.</small>
      <div className="fence-inspector-divider"><strong>Lim za sečenje</strong></div>
      <Field label="Materijal panela"><MaterialSelect value={design.material} onChange={v=>update('material',v)}/></Field>
      <Measure label="Debljina lima (mm)" min={.1} max={50} value={design.thickness} set={v=>update('thickness',v)}/>
    </div>
  </Card>;
}

export function setPanel(design: FenceDesign, target: PanelTarget, panel: PanelChoice): FenceDesign {
  return { ...design, segments: design.segments.map(segment => {
    if (segment.id !== target.id) return segment;
    const panels: Segment['panels'] = [...segment.panels];
    panels[target.leaf] = panel;
    return { ...segment, panels };
  }) };
}

export function PanelLibrary({ models, choose, chooseVoronoi, close }: {
  models: Model[]; choose: (id: string) => void; chooseVoronoi: () => void; close: () => void;
}) {
  const [query, setQuery] = useState('');
  const options = models.filter(model=>model.valid&&searchKey(model.id+' '+model.name+' '+model.category).includes(searchKey(query)));
  return <Dialog title="Izaberi ispunu panela" onClose={close} wide>
    <div className="toolbar wrap"><input aria-label="Pretraži šablone" placeholder="Pretraži DXF biblioteku…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <Button onClick={chooseVoronoi}>Voronoi ispuna</Button>
      <Button onClick={()=>choose('')}>Puni lim</Button></div>
    <div className="mini-library fence-library">{options.map(model=><button type="button" key={model.id} onClick={()=>choose(model.id)}>
      <Thumbnail shape={model.shape}/><strong>{model.name}</strong>
      <small>{model.id} · {mm(model.shape.width)} × {mm(model.shape.height)}</small>
      {isParametric(model.id)&&<span className="badge blue">Parametarski</span>}
      {isRepeatable(model)&&<span className="badge green">Ponavljanje otvora</span>}
    </button>)}</div>
    {!options.length&&<Empty>Nema šablona za unetu pretragu.</Empty>}
  </Dialog>;
}


