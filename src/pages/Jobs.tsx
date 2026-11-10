import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, Eye, FileType, Info, Layers3, Package, Plus, Save, Sigma, Trash2, Upload, TriangleAlert, ArrowLeft, Download, Replace } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activity, dateAt, dateLabel, nextId, num, quantity, releaseReservation } from '../data/business';
import { download, importFiles } from '../data/files';
import { statuses, type Job, type JobPart, type Status } from '../data/types';
import { parseDxf, unitLabels, type Unit } from '../geometry/dxf';
import { Badge, Button, Card, Dialog, Empty, Field, Heading, NumberField, Table, TextLink, Thumbnail } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { searchKey } from '../ui/shell';

export function JobList() {
  const { state } = useWorkshop();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const jobs = state.jobs.filter(job => (!status || job.status === status) && searchKey(job.id+' '+job.name+' '+state.customers.find(c=>c.id===job.customerId)?.name).includes(searchKey(query)));
  return <>
    <Heading icon={ClipboardList} title="Poslovi" subtitle="Pregled poslova od uvoza crteža do gotovog proizvoda."><Link className="button primary" to="/poslovi/novi"><Plus/>Novi posao</Link></Heading>
    <Card title="Svi poslovi" icon={ClipboardList} action={<span className="count">{jobs.length}</span>}>
      <div className="toolbar"><input aria-label="Pretraga poslova" placeholder="Pretraži poslove..." value={query} onChange={e=>setQuery(e.target.value)}/>
        <select aria-label="Status posla" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Svi statusi</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
      <Table head={['#','Naziv posla','Kupac','Materijal','Količina','Rok','Status']}>{jobs.map(job=><tr key={job.id} className="click-row" onClick={()=>navigate('/poslovi/'+job.id)}>
        <td>{job.id}</td><td><Link to={'/poslovi/'+job.id}><strong>{job.name}</strong></Link></td><td>{state.customers.find(c=>c.id===job.customerId)?.name}</td>
        <td>{job.material} {job.thickness} mm</td><td>{quantity(job)} kom</td><td>{dateLabel(job.due)}</td><td><Badge status={job.status}/></td>
      </tr>)}</Table>{!jobs.length&&<Empty>Nema poslova za izabrane kriterijume.</Empty>}
    </Card>
  </>;
}

export const materials = ['Čelik S235', 'Čelik S355', 'Inox', 'Aluminijum', 'Pocinkovani čelik'];
export function MaterialSelect({ value, onChange }: { value: string; onChange: (value: string)=>void }) {
  return <select value={value} onChange={e=>onChange(e.target.value)}>{[...new Set([...materials,value].filter(Boolean))].map(item=><option key={item}>{item}</option>)}</select>;
}

export function JobForm() {
  const { id } = useParams();
  const { state } = useWorkshop();
  const navigate = useNavigate();
  const record = state.jobs.find(job=>job.id===id);
  if (id && !record) return <Card><Empty>Posao nije pronađen. <TextLink to="/poslovi">Poslovi</TextLink></Empty></Card>;
  const query = new URLSearchParams(location.search);
  const customer = state.customers.find(c=>c.id===query.get('kupac'));
  return <JobEditor key={id??'new'} initial={record ?? {
    id: '', name: '', customerId: customer?.id??'', contact: customer?.contact??'', due: dateAt(7),
    material: materials[0], thickness: 3, kind: 'product', note: '', parts: [], status: 'U pripremi',
    progress: 0, machine: '', operator: '', start: '', end: '', planDate: '',
  }} onNavigate={navigate}/>;
}

function JobEditor({ initial, onNavigate }: { initial: Job; onNavigate: (to: string) => void }) {
  const { state, save, run, notify } = useWorkshop();
  const [job, setJob] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [replace, setReplace] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [library, setLibrary] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const change = <K extends keyof Job>(key: K, value: Job[K]) => setJob(old=>({...old,[key]:value}));
  const add = async (files: File[], replaceId?: string | null) => {
    if (!files.length || busy) return;
    setBusy(true);
    await run(async () => {
      if (replaceId && files.length !== 1) throw new Error('Za zamenu izaberite jedan DXF fajl.');
      const parts = await importFiles(files, job.material, job.thickness, state.settings.tolerance);
      setJob(old=>({...old,parts:replaceId ? old.parts.map(part=>part.id===replaceId ? {...parts[0],id:part.id,quantity:part.quantity,excluded:part.excluded} : part) : [...old.parts,...parts]}));
      notify(parts.length + ' DXF fajl(ova) učitano.');
    });
    setBusy(false);
  };
  const choose = (id: string | null) => {
    setReplace(id);
    if(input.current){input.current.multiple=!id;input.current.click();}
  };
  const patch = (id: string, values: Partial<JobPart>) => setJob(old=>({...old,parts:old.parts.map(part=>part.id===id?{...part,...values}:part)}));
  const details = job.parts.find(part=>part.id===preview);
  const submit = async (e: FormEvent<HTMLFormElement>, next = false) => {
    e.preventDefault();
    if(saving||busy)return;
    setError('');
    if (!job.name.trim() || !job.customerId || !job.due || !job.material || job.thickness <= 0) {
      setError('Popunite naziv posla, kupca, rok, materijal i debljinu.'); return;
    }
    const parts = job.parts.map(p=>({...p,material:job.material,thickness:job.thickness}));
    if (next && !parts.some(p=>p.valid && !p.excluded)) { setError('Dodajte najmanje jedan validan DXF fajl za nesting.'); return; }
    let id = job.id;
    setSaving(true);
    const success = await save(data => {
      const old = data.jobs.find(item=>item.id===id);
      id ||= nextId('P-',data.jobs.map(j=>j.id),1070);
      const geometryChanged = !old || old.material!==job.material || old.thickness!==job.thickness ||
        old.parts.length!==parts.length || old.parts.some((part,index)=>part.id!==parts[index]?.id || part.raw!==parts[index]?.raw ||
          part.quantity!==parts[index]?.quantity || part.unit!==parts[index]?.unit || part.valid!==parts[index]?.valid || part.excluded!==parts[index]?.excluded);
      const record = {...(old??job),name:job.name.trim(),id,customerId:job.customerId,contact:job.contact,due:job.due,
        material:job.material,thickness:job.thickness,kind:job.kind,note:job.note,parts,
        nest:geometryChanged ? undefined : old?.nest,nestingAt:geometryChanged?undefined:old?.nestingAt};
      if (old) data.jobs[data.jobs.indexOf(old)] = record;
      else data.jobs.unshift(record);
      if (geometryChanged) data.calculations = data.calculations.filter(calc=>calc.jobId!==id);
      if (geometryChanged && old) releaseReservation(data,id);
      if (old && old.kind!==job.kind) data.calculations = data.calculations.filter(calc=>calc.jobId!==id);
      if (!old || JSON.stringify(old.parts.map(p=>[p.id,p.filename])) !== JSON.stringify(parts.map(p=>[p.id,p.filename])))
        for (const part of parts.filter(p=>!old?.parts.some(o=>o.id===p.id && o.raw===p.raw))) activity(data,'dxf','Učitan DXF fajl: '+part.filename,'/poslovi/'+id);
      activity(data,'job',(old?'Ažuriran posao ':'Kreiran posao ')+id+' · '+record.name,'/poslovi/'+id);
    }, 'Posao je sačuvan.');
    setSaving(false);
    if (success && (next || !job.id)) onNavigate(next ? '/nesting/'+id : '/poslovi/'+id);
  };
  const blocked = job.parts.filter(p=>!p.valid).length;
  return <>
    <div className="breadcrumbs"><Link to="/poslovi"><ArrowLeft size={15}/> Poslovi</Link><span>›</span><strong>{job.id || 'Novi posao'}</strong></div>
    <Heading icon={ClipboardList} title={job.id ? job.name : 'Novi posao'} subtitle="Importuj DXF fajlove, proveri geometriju i pripremi posao za sečenje.">{job.id&&<><span className="date-pill">{job.id}</span>
      {job.fence&&state.fenceProjects?.some(project=>project.id===job.fence?.projectId)&&<TextLink to={'/projektovanje-ograda/'+job.fence.projectId}>Projekat ograde</TextLink>}
      <TextLink to={'/proizvodnja/'+job.id}>Radni nalog</TextLink></>}</Heading>
    <form onSubmit={e=>void submit(e, (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='nest')}>
      <Card className="job-fields">
        <div className="form-grid three">
          <Field label="Naziv posla" required><input required value={job.name} placeholder="Naziv posla" onChange={e=>change('name',e.target.value)}/></Field>
          <Field label="Kupac" required><select required value={job.customerId} onChange={e=>setJob({...job,customerId:e.target.value,contact:state.customers.find(c=>c.id===e.target.value)?.contact??''})}>
            <option value="">Izaberite kupca</option>{state.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Rok" required><input required type="date" value={job.due} onChange={e=>change('due',e.target.value)}/></Field>
          <Field label="Materijal" required><MaterialSelect value={job.material} onChange={v=>change('material',v)}/></Field>
          <Field label="Debljina (mm)" required><NumberField label="Debljina (mm)" min={.1} value={job.thickness} onChange={v=>change('thickness',v)}/></Field>
          <Field label="Napomena"><textarea rows={2} value={job.note} placeholder="Zahtevi obrade ili isporuke" onChange={e=>change('note',e.target.value)}/></Field>
        </div>
        <details className="job-extra"><summary>Kontakt i vrsta posla</summary><div className="form-grid three">
          <Field label="Kontakt"><input value={job.contact} onChange={e=>change('contact',e.target.value)}/></Field>
          <Field label="Vrsta posla"><select value={job.kind} onChange={e=>change('kind',e.target.value as Job['kind'])}><option value="product">Kompletan proizvod</option><option value="cnc">CNC usluga</option></select></Field>
        </div></details>
      </Card>
      <div className="job-layout">
        <div className="stack">
          <Card className="drop-card">
            <div className={'dropzone '+(dragging?'dragging':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void add([...e.dataTransfer.files]);}}>
              <FileType className="drop-icon"/><h2>Prevuci DXF fajlove ovde</h2><p>ili klikni na dugme da izabereš fajlove sa računara</p>
              <Button icon={Upload} variant="primary" disabled={busy} onClick={()=>choose(null)}>{busy?'Učitavanje…':'Izaberi fajlove'}</Button>
            </div>
            <input ref={input} type="file" aria-label="Uvoz DXF fajlova" accept=".dxf" multiple={!replace} className="visually-hidden" onChange={e=>{void add([...e.target.files??[]],replace);e.target.value='';}}/>
            <div className="drop-caption"><span><CheckCircle2/>ASCII DXF</span><span><Layers3/>Više fajlova odjednom</span><span><TriangleAlert/>Automatska provera geometrije</span></div>
          </Card>
          <Card icon={Layers3} title={'Uvezeni DXF fajlovi ('+job.parts.length+')'} action={<div className="inline-actions">
            <Button variant="bare" icon={Plus} onClick={()=>setLibrary(true)}>Iz biblioteke</Button>
            <Button variant="bare" icon={Trash2} disabled={!selected.length} onClick={()=>{change('parts',job.parts.filter(p=>!selected.includes(p.id)));setSelected([]);}}>Ukloni izabrane</Button>
          </div>}>
            <Table head={['','Pregled','Naziv fajla','Dimenzije (mm)','Količina','Materijal','Status','']}>{job.parts.map(part=><tr key={part.id}>
              <td><input type="checkbox" aria-label={'Izaberi '+part.filename} checked={selected.includes(part.id)} onChange={e=>setSelected(e.target.checked?[...selected,part.id]:selected.filter(id=>id!==part.id))}/></td>
              <td><button type="button" className="thumbnail-button" aria-label={'Pregled '+part.filename} onClick={()=>setPreview(part.id)}><Thumbnail shape={part.shape} preview={part.preview}/></button></td>
              <td><button type="button" className="link-button" onClick={()=>setPreview(part.id)}>{part.filename}</button></td>
              <td>{part.unit||part.builtin?num(part.shape.width,1)+' × '+num(part.shape.height,1):'—'}</td><td className="qty-cell"><NumberField label={'Količina '+part.filename} value={part.quantity} min={1} max={500} step={1} onChange={v=>patch(part.id,{quantity:Math.round(v)})}/></td>
              <td>{job.material} {job.thickness} mm</td><td><span className={'badge '+(part.valid?'green':'amber')}>{part.valid?<CheckCircle2 size={14}/>:<TriangleAlert size={14}/>} {part.valid?'Ispravan':'Potrebna provera'}</span></td>
              <td><Button variant="bare" icon={Replace} aria-label={'Zameni '+part.filename} title="Zameni fajl" onClick={()=>choose(part.id)}/></td>
            </tr>)}</Table>{!job.parts.length&&<Empty>Dodajte fajlove ili izaberite modele iz biblioteke.</Empty>}
          </Card>
        </div>
        <Card className="job-summary" title="Rezime posla" icon={Sigma}>
          <dl className="summary-list"><div><dt><FileType/>Broj fajlova</dt><dd>{job.parts.length}</dd></div><div><dt><Package/>Ukupno komada</dt><dd>{quantity(job)}</dd></div><div><dt><Layers3/>Materijal</dt><dd>{job.material} ({job.thickness} mm)</dd></div></dl>
          <div className={'notice '+(blocked?'amber':'')}><Info size={18}/><div><strong>Napomena o validaciji</strong><p>{blocked?blocked+' fajl(ova) zahteva proveru pre optimizacije. Otvorite pregled za detalje.':'Fajlovi se proveravaju pri uvozu. Proverite jedinice, konture i dimenzije pre nastavka.'}</p></div></div>
          {error&&<p role="alert" className="error-text">{error}</p>}
          <Button type="submit" value="nest" variant="primary" icon={ArrowRight} disabled={busy||saving}>Nastavi na nesting</Button>
          <Button type="submit" icon={Save} disabled={busy||saving}>Sačuvaj posao</Button>
          {job.parts.length>0&&<Button variant="bare" icon={Eye} onClick={()=>setPreview(job.parts[0].id)}>Pregled geometrije fajlova</Button>}
        </Card>
      </div>
    </form>
    {details&&<Dialog title={details.filename} wide onClose={()=>setPreview(null)}>
      <Thumbnail shape={details.shape} preview={details.preview} className="large-drawing"/>
      <p>{details.unit||details.builtin?num(details.shape.width,2)+' × '+num(details.shape.height,2)+' mm · ':''}{details.shape.rings.length} zatvorenih kontura</p>
      {details.issues.length>0&&<ul className="issues">{details.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
      {!details.builtin&&<Field label="Jedinica crteža"><select value={details.unit??''} onChange={e=>{
        const unit=Number(e.target.value) as Unit;
        const result=parseDxf(details.raw,unit,state.settings.tolerance);
        patch(details.id,{unit,shape:result.shape,preview:result.preview,issues:result.issues,valid:result.valid});
      }}><option value="" disabled>Potvrdi jedinicu</option>{unitLabels.map(([unit,label])=><option key={unit} value={unit}>{label}</option>)}</select></Field>}
      <div className="dialog-actions"><Button icon={Download} onClick={()=>download(details.raw,details.filename,'application/dxf')}>Preuzmi DXF</Button><Button icon={Replace} onClick={()=>choose(details.id)}>Zameni fajl</Button>
        <Button icon={Trash2} onClick={()=>{change('parts',job.parts.filter(p=>p.id!==details.id));setPreview(null);}}>Ukloni</Button></div>
    </Dialog>}
    {library&&<Dialog title="Dodaj model iz biblioteke" wide onClose={()=>setLibrary(false)}>
      <input className="full" aria-label="Pretraži biblioteku" placeholder="Pretraži biblioteku..." value={libraryQuery} onChange={e=>setLibraryQuery(e.target.value)}/>
      <div className="mini-library">{state.models.filter(m=>searchKey(m.name+' '+m.id).includes(searchKey(libraryQuery))).map(m=><button type="button" key={m.id} onClick={()=>{
        change('parts',[...job.parts,{...m,id:crypto.randomUUID(),material:job.material,thickness:job.thickness}]);setLibrary(false);
      }}><Thumbnail shape={m.shape}/><strong>{m.name}</strong><small>{m.id}</small></button>)}</div>
    </Dialog>}
  </>;
}

export function JobSelect({ value, onChange, label = 'Posao' }: { value: string; onChange: (id:string)=>void; label?: string }) {
  const { state } = useWorkshop();
  return <select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{state.jobs.map(job=><option key={job.id} value={job.id}>{job.id} — {job.name}</option>)}</select>;
}
export function StatusSelect({ value, kind, onChange }: { value: Status; kind: Job['kind']; onChange: (status: Status)=>void }) {
  return <select aria-label="Status" value={value} onChange={e=>onChange(e.target.value as Status)}>{statuses.filter(s=>kind==='product'||s!=='Zavarivanje / obrada'||s===value).map(s=><option key={s}>{s}</option>)}</select>;
}

