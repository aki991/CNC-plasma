import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Copy, Download, Fence as FenceIcon, FileType, Layers3, Plus, Redo2, Ruler, Settings2, Trash2, Undo2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { dateLabel, uid } from '../data/business';
import { checkSpace, download } from '../data/files';
import type { Model } from '../data/types';
import { FenceCanvas, mm, type Selection } from '../fence/Canvas';
import { FenceInspector, Measure, PanelLibrary, kindLabels, setPanel, type PanelTarget } from '../fence/Inspector';
import { fenceJobChoices, sendFenceToJob } from '../fence/jobs';
import { MAX_SEGMENTS, canMergeAtPost, changeSegmentCount, duplicateFence, fenceLayout, insertSegment, makeSegment, newFence, redistributeLength, removePost, removeSegment, segmentBoundary, segmentName, splitWithPost } from '../fence/layout';
import { analyzeFence, fenceKey, isRepeatable, newVoronoiChoice, type FenceAnalysis } from '../fence/panels';
import { findFence, useFenceDraft } from '../fence/persistence';
import type { FenceDesign, FenceProject, GeneratedFence, PanelChoice, Segment } from '../fence/types';
import { Button, Card, Dialog, Empty, Field, Heading, Table, TextLink, Thumbnail } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { FieldInbox } from '../fence/FieldInbox';
import './fences.css';

const url = '/projektovanje-ograda';
const downloadPart = (part: Model) => download(part.raw, part.filename, 'application/dxf');
const modifiedLabel = (iso: string) => dateLabel(iso.slice(0,10)) + ' · ' + new Date(iso).toLocaleTimeString('sr-Latn-RS',{hour:'2-digit',minute:'2-digit'});

export function Fences() {
  const { id } = useParams();
  const { state, save } = useWorkshop();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [fieldInbox, setFieldInbox] = useState(false);
  const openNew = async (source?: FenceProject) => {
    setCreating(true);
    const project = source ? duplicateFence(source) : newFence();
    if (await save(data => { (data.fenceProjects ??= []).unshift(project); })) navigate(url+'/'+project.id);
    setCreating(false);
  };
  if (id) {
    const project = findFence(state,id);
    return project?<FenceEditor project={project} key={id}/>:<Card><Empty>Projekat nije pronađen. <TextLink to={url}>Svi projekti</TextLink></Empty></Card>;
  }
  const projects = [...(state.fenceProjects ?? [])].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return <>
    <Heading icon={FenceIcon} title="Projektovanje ograda" subtitle="Projektujte ogradu i pripremite DXF panele za CNC sečenje.">
      <Button icon={Ruler} onClick={() => setFieldInbox(true)}>Terenska merenja</Button>
      <Button variant="primary" icon={Plus} disabled={creating} onClick={()=>void openNew()}>Novi projekat</Button>
    </Heading>
    {fieldInbox && <FieldInbox close={() => setFieldInbox(false)}/>}
    <Card title="Projekti ograda" icon={FenceIcon} action={<span className="count">{projects.length}</span>}>
      {projects.length?<Table head={['Projekat','Kupac','Ukupna dužina','Segmenti / stubovi','Posao','Poslednja izmena','']}>
        {projects.map(project=><tr key={project.id}>
          <td><Link className="text-link" to={url+'/'+project.id}>{project.design.name.trim()||'Projekat bez naziva'}</Link></td>
          <td>{state.customers.find(c=>c.id===project.design.customerId)?.name??'—'}</td><td>{mm(fenceLayout(project.design).length)}</td>
          <td>{project.design.segments.length} / {project.design.posts.length}</td>
          <td>{project.jobId?<TextLink arrow={false} to={'/poslovi/'+project.jobId}>{project.jobId}</TextLink>:'—'}</td><td>{modifiedLabel(project.updatedAt)}</td>
          <td><div className="inline-actions">
            <Button icon={Copy} variant="bare" aria-label={'Dupliraj '+project.design.name} disabled={creating} onClick={()=>void openNew(project)}/>
            <Button icon={Trash2} variant="bare" aria-label={'Obriši '+project.design.name} onClick={()=>{
              if(confirm('Obrisati projekat „'+project.design.name+'“? Povezani poslovi i uvezeni paneli ostaju u evidenciji.'))void save(data=>{
                data.fenceProjects=data.fenceProjects?.filter(item=>item.id!==project.id);
              },'Projekat je obrisan.');
            }}/>
          </div></td>
        </tr>)}
      </Table>:<div className="fence-welcome"><FenceIcon size={36}/><h2>Započnite projekat ograde</h2>
        <p>Postavite stubove i segmente, izaberite ispunu i pripremite panele za sečenje.</p>
        <Button variant="primary" icon={Plus} disabled={creating} onClick={()=>void openNew()}>Projektuj ogradu</Button>
      </div>}
    </Card>
  </>;
}

function generateInWorker(project: FenceProject, models: Model[], approve: boolean) {
  return new Promise<GeneratedFence>((resolve,reject)=>{
    const worker = new Worker(new URL('../fence/generate.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage = ({data}:MessageEvent<{result?:GeneratedFence;error?:string}>) => {
      worker.terminate();
      if(data.result)resolve(data.result);
      else reject(new Error(data.error??'Generisanje DXF-a nije uspelo.'));
    };
    worker.onerror = () => {worker.terminate();reject(new Error('DXF generator nije mogao da se pokrene.'));};
    worker.postMessage([project,models,approve]);
  });
}

function FenceEditor({ project: initial }: { project: FenceProject }) {
  const { state, notify, run, save } = useWorkshop();
  const navigate = useNavigate();
  const draft = useFenceDraft(initial);
  const { project, edit } = draft;
  const { design } = project;
  const analysis = useMemo(()=>analyzeFence(design,state.models),[design,state.models]);
  const [selection,setSelection]=useState<Selection>(null);
  const [picker,setPicker]=useState<PanelTarget>();
  const [deletion,setDeletion]=useState<NonNullable<Selection>>();
  const [dialog,setDialog]=useState<'length'|'count'|'gate'|'scale'|'send'>();
  const [viewPart,setViewPart]=useState<Model>();
  const [busy,setBusy]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [destination,setDestination]=useState(project.jobId??'');
  const [fieldDetails, setFieldDetails] = useState(false);
  const selectedIndex=selection?.kind==='segment'?design.segments.findIndex(segment=>segment.id===selection.id):-1;
  const selectedPostIndex=selection?.kind==='post'?design.posts.findIndex(post=>post.id===selection.id):-1;
  const generated=project.generated?.key===fenceKey(design,state.models)?project.generated:undefined;
  const activeSelection=selectedIndex>=0||selectedPostIndex>=0?selection:null;
  const chooseModel=()=>{
    const index=Math.max(0,selectedIndex);
    const item=design.segments[index];
    if(!item)return;
    setPicker({id:item.id,leaf:selection?.kind==='segment'&&item.kind==='double'?selection.leaf??0:0});
  };
  const applyInfill=(target:PanelTarget,choice:PanelChoice)=>{
    edit(old=>setPanel(old,target,choice));
    setSelection({kind:'segment',id:target.id,leaf:target.leaf});
    setPicker(undefined);
  };
  const addSegment=(kind:Segment['kind'])=>{
    const item=makeSegment(kind);
    edit(old=>insertSegment(old,item,selectedIndex>=0?selectedIndex:old.segments.length-1));
    setSelection({kind:'segment',id:item.id});
    setDialog(undefined);
  };
  const splitIndex=selectedIndex>=0?selectedIndex:design.segments.findIndex(segment=>segment.kind==='panel'&&!segment.locked);
  const addPost=()=>{
    if(!design.posts.length){
      const post={id:uid()};
      edit(old=>({...old,posts:[post]}));
      setSelection({kind:'post',id:post.id});
      return;
    }
    edit(old=>{
      const next=splitWithPost(old,splitIndex);
      setSelection({kind:'post',id:next.posts[splitIndex+1].id});
      return next;
    });
  };

  const generate=async(approve:boolean)=>{
    setDialog(undefined);
    setBusy(true);
    if(await draft.flush())await run(async()=>{
      const snapshot=draft.current.current;
      const keys=new Set(snapshot.design.segments.flatMap(segment=>segment.panels.map(panel=>panel.modelId)));
      const models=state.models.filter(model=>keys.has(model.id));
      const result=await generateInWorker(snapshot,models,approve);
      if(result.key!==fenceKey(draft.current.current.design,state.models))throw new Error('Projekat je izmenjen tokom generisanja. Ponovite generisanje.');
      await checkSpace(result.parts.reduce((sum,part)=>sum+part.raw.length,0));
      if(result.key!==fenceKey(draft.current.current.design,state.models))throw new Error('Projekat je izmenjen tokom generisanja. Ponovite generisanje.');
      if(await draft.persist({generated:result}))notify('Proizvodni DXF fajlovi su generisani i sačuvani.');
    });
    setBusy(false);
  };
  const startGeneration=()=>{
    if(!design.name.trim()) {notify('Unesite naziv projekta.',true);return;}
    if(analysis.errors.length) {notify(analysis.errors[0],true);return;}
    if(analysis.warnings.length){setConfirmed(false);setDialog('scale');return;}
    void generate(false);
  };
  const send=async()=>{
    setBusy(true);
    if(await draft.flush()){
      const snapshot=draft.current.current;
      let jobId='';
      const ok=await save(data=>{
        const stored=findFence(data,snapshot.id);
        if(!stored||stored.revision!==snapshot.revision)throw new Error('Projekat je izmenjen. Ponovo ga otvorite.');
        jobId=sendFenceToJob(data,stored,destination);
        if(stored.jobId!==jobId){
          stored.jobId=jobId;
          stored.revision++;
          stored.updatedAt=new Date().toISOString();
        }
      },'Paneli su povezani sa poslom.');
      if(ok){navigate('/nesting/'+jobId);return;}
    }
    setBusy(false);
  };

  return <div className="fence-workspace" onBlurCapture={draft.endGroup} onKeyDown={event=>{
    if(!(event.ctrlKey||event.metaKey)||!(event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y')||
      (event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,dialog')))return;
    event.preventDefault();
    if(event.shiftKey||event.key.toLowerCase()==='y')draft.redo();
    else draft.undo();
  }}>
    <Heading icon={FenceIcon} title="Projektovanje ograda" subtitle="Konstruišite ravnu ogradu i generišite proizvodne konture za sečenje.">
      {project.fieldSource && <Button icon={Ruler} onClick={() => setFieldDetails(true)}>Terenske mere i fotografije</Button>}
      <Button icon={ArrowLeft} onClick={async()=>{if(await draft.flush())navigate(url);}}>Svi projekti</Button>
    </Heading>
    {fieldDetails && <FieldInbox initial={project.fieldSource?.key} close={() => setFieldDetails(false)}/>}
    <Card className="fence-projectbar">
      <div className="fence-projecttitle"><FenceIcon/><div><h2>{design.name.trim()||'Projekat bez naziva'}</h2>
        <small>{state.customers.find(c=>c.id===design.customerId)?.name??'Kupac nije izabran'} · {mm(analysis.length)}</small></div></div>
      <div className="inline-actions wrap">
        <span role="status" className={draft.status==='saved'?'green-text':draft.status==='error'?'error-text':'muted'}>
          {draft.status==='saved'&&<CheckCircle2 size={15}/>} {draft.status==='saving'?'Čuvanje…':draft.status==='error'?'Izmena nije sačuvana':'Automatski sačuvano'}</span>
        <Button icon={Undo2} disabled={!draft.canUndo||busy} aria-label="Poništi izmenu" onClick={draft.undo}/>
        <Button icon={Redo2} disabled={!draft.canRedo||busy} aria-label="Ponovi izmenu" onClick={draft.redo}/>
      </div>
    </Card>
    <div className="fence-layout">
      <div className="stack fence-tools">
        <Card title="Elementi ograde" icon={Layers3}>
          <div className="fence-tool-buttons">
            <Button icon={Plus} disabled={design.segments.length>=MAX_SEGMENTS} onClick={()=>addSegment('panel')}>Dodaj segment</Button>
            <Button icon={Plus} disabled={(!!design.posts.length&&splitIndex<0)||design.segments.length>=MAX_SEGMENTS} onClick={addPost}>Dodaj stub</Button>
            <Button icon={Plus} disabled={design.segments.length>=MAX_SEGMENTS} onClick={()=>setDialog('gate')}>Dodaj kapiju</Button>
            <Button icon={FileType} disabled={!design.segments.length} onClick={chooseModel}>DXF biblioteka</Button>
          </div>
          <Button icon={Trash2} className="fence-delete-button" disabled={!activeSelection||busy} onClick={()=>activeSelection&&setDeletion(activeSelection)}>
            {selectedPostIndex>=0?'Obriši stub':selectedIndex>=0?design.segments[selectedIndex].kind==='panel'?'Obriši segment':'Obriši kapiju':'Obriši izabrani element'}
          </Button>
          <button type="button" className={'fence-tree-item '+(!activeSelection?'active':'')} onClick={()=>setSelection(null)}><Settings2 size={16}/> Parametri projekta <ChevronRight size={14}/></button>
          <div className="fence-tree">
            {analysis.posts.map((post,i)=><div key={post.id}>
              <button type="button" className={'fence-tree-item '+(selectedPostIndex===i?'active':'')} onClick={()=>setSelection({kind:'post',id:post.id})}>
                <i className="fence-tree-post"/><span>Stub {i+1}</span><small>{mm(post.width)}</small>
              </button>
              {analysis.spans[i]&&<button type="button" className={'fence-tree-item span '+(selectedIndex===i?'active':'')}
                onClick={()=>setSelection({kind:'segment',id:analysis.spans[i].segment.id})}>
                <FenceIcon size={15}/><span>{segmentName(analysis.spans[i].segment,i)}</span><small>{mm(analysis.spans[i].width)}</small>
              </button>}
            </div>)}
          </div>
        </Card>
        <Card title="Proizvodnja" icon={FileType}>
          <div className="fence-production-actions">
            <span><strong>{analysis.summary.panelCount}</strong> {analysis.summary.panelCount===1?'limeni panel':'limenih panela'}</span>
            <Button icon={FileType} variant="primary" disabled={busy||!design.segments.length} validateNumbers onClick={startGeneration}>{busy?'Obrada…':'Generiši DXF za sečenje'}</Button>
            <Button icon={ArrowRight} disabled={busy||!generated} validateNumbers onClick={()=>{
              if(!design.customerId){notify('Izaberite kupca u parametrima projekta.',true);setSelection(null);return;}
              setDestination(project.jobId??'');setDialog('send');
            }}>Pošalji u nesting</Button>
            {project.jobId&&<TextLink to={'/nesting/'+project.jobId}>Posao {project.jobId}</TextLink>}
          </div>
        </Card>
      </div>
      <div className="stack">
        <FenceCanvas analysis={analysis} selection={activeSelection} select={setSelection} editLength={()=>setDialog('length')} frame={design.frame}/>
        <Card className="fence-result" title="Proizvodni DXF" icon={FileType} action={generated&&<span className="badge green">{generated.parts.length} {generated.parts.length===1?'različit deo':'različitih delova'}</span>}>
          {analysis.errors.length>0&&<details className="fence-problems" open><summary>Potrebna provera · {analysis.errors.length}</summary>
            <ul>{analysis.errors.map((message,i)=><li key={i}>{message}</li>)}</ul></details>}
          {generated?<Table head={['Geometrija','Deo','Dimenzije','Kom.','']}>{generated.parts.map(part=><tr key={part.id}>
            <td><div className="fence-part-thumb"><Thumbnail shape={part.shape}/></div></td>
            <td><button type="button" className="link-button" onClick={()=>setViewPart(part)}>{part.name}</button></td>
            <td>{mm(part.shape.width)} × {mm(part.shape.height)}</td><td>{part.quantity}</td>
            <td><Button variant="bare" icon={Download} aria-label={'Preuzmi '+part.filename} onClick={()=>downloadPart(part)}/></td>
          </tr>)}</Table>:!analysis.errors.length&&<Empty>{!design.segments.length?'Dodajte segment ili kapiju za pripremu DXF-a.':project.generated?'Ponovo generišite DXF za aktuelni raspored otvora.':'Generišite DXF da biste pregledali konture i količine za sečenje.'}</Empty>}
        </Card>
      </div>
      <FenceInspector key={activeSelection?.id??'project'} design={design} analysis={analysis} customers={state.customers} models={state.models} selection={activeSelection}
        select={setSelection} edit={edit} pick={setPicker} resize={()=>setDialog('length')} count={()=>setDialog('count')}/>
    </div>
    {picker&&<PanelLibrary models={state.models} close={()=>setPicker(undefined)} choose={modelId=>{
      const repeatable=isRepeatable(state.models.find(model=>model.id===modelId));
      applyInfill(picker,{modelId,mode:repeatable?'repeat':'fixed'});
    }} chooseVoronoi={()=>applyInfill(picker,newVoronoiChoice())}/>}
    {deletion&&<DeleteFenceElement design={design} selection={deletion} close={()=>setDeletion(undefined)} apply={remove=>{
      edit(remove);
      setSelection(null);
      setDeletion(undefined);
    }}/>}
    {dialog==='length'&&<LengthDialog design={design} analysis={analysis} close={()=>setDialog(undefined)} apply={value=>{edit(()=>value);setDialog(undefined);}}/>}
    {dialog==='count'&&<CountDialog design={design} close={()=>setDialog(undefined)} apply={value=>{edit(()=>value);setDialog(undefined);}}/>}
    {dialog==='gate'&&<GateDialog close={()=>setDialog(undefined)} add={addSegment}/>}
    {dialog==='scale'&&<Dialog title="Potvrdi proporcionalno skaliranje" onClose={()=>setDialog(undefined)}>
      <p>Proverite nove dimenzije panela i širinu mostova nakon skaliranja.</p>
      <ul className="fence-scale-warnings">{analysis.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
      <label className="fence-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Potvrđujem proporcionalno skaliranje prikazanih panela</label>
      <div className="dialog-actions"><Button variant="primary" disabled={!confirmed||busy} onClick={()=>void generate(true)}>Potvrdi i generiši</Button></div>
    </Dialog>}
    {dialog==='send'&&<Dialog title="Pošalji u nesting" onClose={()=>{if(!busy)setDialog(undefined);}}>
      <p>{analysis.summary.panelCount} kom · {design.material} · {mm(design.thickness)}</p>
      <Field label="Odredišni posao"><select value={destination} disabled={!!project.jobId||busy} onChange={e=>setDestination(e.target.value)}>
        {project.jobId?<option value={project.jobId}>{project.jobId} · {state.jobs.find(job=>job.id===project.jobId)?.name??design.name}</option>:<>
          <option value="">Kreiraj novi posao</option>{fenceJobChoices(state,project).map(job=><option key={job.id} value={job.id}>{job.id} · {job.name}</option>)}
        </>}
      </select></Field>
      {destination&&<p className="muted">Postojeći ručno dodati delovi ostaju u poslu. Novi proizvodni paneli osvežavaju njegov nesting i kalkulaciju.</p>}
      <div className="dialog-actions"><Button variant="primary" icon={ArrowRight} disabled={busy} onClick={()=>void send()}>Otvori nesting</Button></div>
    </Dialog>}
    {viewPart&&<Dialog title={viewPart.name} onClose={()=>setViewPart(undefined)} wide>
      <Thumbnail className="large-drawing" shape={viewPart.shape}/>
      <p>{viewPart.filename} · {viewPart.quantity} kom · {viewPart.shape.rings.length} zatvorenih kontura</p>
      <div className="dialog-actions"><Button icon={Download} variant="primary" onClick={()=>downloadPart(viewPart)}>Preuzmi DXF</Button></div>
    </Dialog>}
  </div>;
}

function DeleteFenceElement({design,selection,close,apply}:{
  design:FenceDesign;selection:NonNullable<Selection>;close:()=>void;apply:(remove:(current:FenceDesign)=>FenceDesign)=>void;
}) {
  const [selected,setSelected]=useState(0);
  const options:{label:string;description:string;remove:(current:FenceDesign)=>FenceDesign}[]=[];
  let title='';
  if(selection.kind==='segment'){
    const index=design.segments.findIndex(segment=>segment.id===selection.id);
    if(index<0)return null;
    const name=segmentName(design.segments[index],index);
    const boundary=segmentBoundary(design,index);
    title='Brisanje · '+name;
    options.push({label:'Obriši element',description:name+' i granični stub '+(boundary+1)+' biće uklonjeni.',
      remove:current=>removeSegment(current,index)});
  }else{
    const index=design.posts.findIndex(post=>post.id===selection.id);
    if(index<0)return null;
    title='Brisanje · Stub '+(index+1);
    if(!design.segments.length) options.push({label:'Obriši stub',description:'Stub '+(index+1)+' biće uklonjen.',
      remove:current=>removePost(current,index)});
    if(canMergeAtPost(design,index)) options.push({label:'Spoji susedne segmente',
      description:'Međustub se uklanja i susedna segmenta se spajaju. Zadržava se ispuna levog segmenta.',
      remove:current=>removePost(current,index)});
    for(const adjacent of [index-1,index]){
      const segment=design.segments[adjacent];
      if(!segment)continue;
      const name=segmentName(segment,adjacent);
      options.push({label:'Ukloni i '+name,description:'Stub '+(index+1)+' i '+name+' biće uklonjeni.',
        remove:current=>removePost(current,index,adjacent)});
    }
  }
  const option=options[selected];
  return <Dialog title={title} onClose={close}>
    {options.length>1&&<Field label="Posle uklanjanja stuba"><select value={selected} onChange={e=>setSelected(Number(e.target.value))}>
      {options.map(({label},i)=><option key={label} value={i}>{label}</option>)}
    </select></Field>}
    <p>{option.description}</p>
    <div className="dialog-actions">
      <Button onClick={close}>Otkaži</Button>
      <Button icon={Trash2} variant="primary" onClick={()=>apply(option.remove)}>Potvrdi brisanje</Button>
    </div>
  </Dialog>;
}

function LengthDialog({ design, analysis, close, apply }: { design: FenceDesign; analysis: FenceAnalysis; close:()=>void; apply:(value:FenceDesign)=>void }) {
  const [length,setLength]=useState(analysis.length);
  const [strategy,setStrategy]=useState<'even'|'proportional'>('even');
  let result:FenceDesign|undefined, error='';
  try { result=redistributeLength(design,length,strategy); }
  catch(cause) { error=cause instanceof Error?cause.message:'Preraspodela nije uspela.'; }
  return <Dialog title="Promeni ukupnu dužinu" onClose={close}>
    <div className="form-grid two">
      <Measure label="Nova ukupna dužina (mm)" value={length} min={1} max={500000} set={setLength}/>
      <Field label="Raspodela razlike"><select value={strategy} onChange={e=>setStrategy(e.target.value as typeof strategy)}>
        <option value="even">Ravnomerno</option><option value="proportional">Srazmerno širinama</option></select></Field>
    </div>
    <p>Kapije i zaključane širine zadržavaju mere. Raspodela menja samo otključane segmente ograde.</p>
    {error&&<p className="error-text" role="alert">{error}</p>}
    {result&&result!==design&&<Table head={['Element','Pre','Posle']}>{result.segments.map((item,i)=>
      <tr key={item.id}><td>{segmentName(item,i)}</td><td>{mm(design.segments[i].width)}</td><td>{mm(item.width)}</td></tr>)}</Table>}
    <div className="dialog-actions"><Button variant="primary" icon={Ruler} disabled={!result||result===design} validateNumbers onClick={()=>result&&apply(result)}>Primeni preraspodelu</Button></div>
  </Dialog>;
}

function CountDialog({ design, close, apply }: { design:FenceDesign; close:()=>void; apply:(value:FenceDesign)=>void }) {
  const [count,setCount]=useState(Math.max(1,design.segments.length));
  const [error,setError]=useState('');
  return <Dialog title="Broj segmenata i stubova" onClose={close}>
    <Measure label="Broj segmenata" value={count} min={1} max={MAX_SEGMENTS} integer set={setCount}/>
    <p>{count+1} stubova, uključujući deljene međustubove. Broj se menja dodavanjem ili uklanjanjem segmenata na kraju trase.</p>
    {error&&<p className="error-text" role="alert">{error}</p>}
    <div className="dialog-actions"><Button variant="primary" validateNumbers onClick={()=>{
      try{apply(changeSegmentCount(design,count));}catch(cause){setError(cause instanceof Error?cause.message:'Izmena nije uspela.');}
    }}>Primeni broj segmenata</Button></div>
  </Dialog>;
}

function GateDialog({ close, add }: { close:()=>void; add:(value:Segment['kind'])=>void }) {
  const [kind,setKind]=useState<Segment['kind']>('single');
  return <Dialog title="Dodaj kapiju" onClose={close}>
    <Field label="Tip kapije"><select value={kind} onChange={e=>setKind(e.target.value as Segment['kind'])}>
      <option value="single">{kindLabels.single}</option><option value="double">{kindLabels.double}</option>
    </select></Field>
    <p>Kapija se dodaje posle izabranog segmenta ili na kraj trase.</p>
    <div className="dialog-actions"><Button variant="primary" icon={Plus} onClick={()=>add(kind)}>Umetni kapiju</Button></div>
  </Dialog>;
}

