import { useRef, useState } from 'react';
import { Download, FileType, Plus, Star, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activity, num, releaseReservation, sqm, uid } from '../data/business';
import { download, importFiles } from '../data/files';
import { parseDxf, unitLabels, type Unit } from '../geometry/dxf';
import { Button, Card, Dialog, Empty, Field, Heading, NumberField, Thumbnail } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { searchKey } from '../ui/shell';
import { JobSelect } from './Jobs';

export function Library() {
  const { state, save, run } = useWorkshop();
  const { id } = useParams();
  const navigate = useNavigate();
  const model = state.models.find(m=>m.id===id);
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('');
  const [material,setMaterial]=useState('');
  const [favorites,setFavorites]=useState(false);
  const [target,setTarget]=useState(state.jobs[0]?.id??'');
  const [amount,setAmount]=useState(model?.quantity??1);
  const input=useRef<HTMLInputElement>(null);
  const filtered=state.models.filter(m=>(!category||m.category===category)&&(!material||m.material===material)&&(!favorites||m.favorite)&&searchKey(m.name+' '+m.id+' '+m.filename).includes(searchKey(search)));
  const toggle=(id:string)=>save(data=>{const row=data.models.find(m=>m.id===id);if(row)row.favorite=!row.favorite;});
  return <>
    <Heading icon={FileType} title="DXF fajlovi" subtitle="Biblioteka modela za ograde, kapije, panele i limene pozicije.">
      <Button variant="primary" icon={Upload} onClick={()=>input.current?.click()}>Uvezi DXF</Button>
      <input ref={input} type="file" multiple accept=".dxf" className="visually-hidden" aria-label="Uvoz u biblioteku" onChange={e=>{
        const files=[...e.target.files??[]];e.target.value='';if(!files.length)return;
        void run(async()=>{const models=await importFiles(files,'Čelik S235',3,state.settings.tolerance);
          await save(data=>{data.models.unshift(...models);models.forEach(m=>activity(data,'dxf','Dodat DXF: '+m.filename,'/dxf/'+m.id));},'DXF fajlovi su sačuvani u biblioteci.');
        });
      }}/>
    </Heading>
    <Card className="library-toolbar"><div className="toolbar">
      <input aria-label="Pretraga modela" placeholder="Pretraži modele..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <select aria-label="Kategorija" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Sve kategorije</option>{[...new Set(state.models.map(m=>m.category))].map(c=><option key={c}>{c}</option>)}</select>
      <select aria-label="Materijal modela" value={material} onChange={e=>setMaterial(e.target.value)}><option value="">Svi materijali</option>{[...new Set(state.models.map(m=>m.material))].map(m=><option key={m}>{m}</option>)}</select>
      <Button icon={Star} aria-pressed={favorites} onClick={()=>setFavorites(!favorites)}>Favoriti</Button><span className="count">{filtered.length}</span>
    </div></Card>
    <div className="model-grid">{filtered.map(m=><Card key={m.id} className="model-card">
      <Link className="model-preview" to={'/dxf/'+m.id}><Thumbnail shape={m.shape} preview={m.preview}/></Link>
      <div className="model-meta"><span className="badge blue">{m.category}</span><Button icon={Star} variant={'bare '+(m.favorite?'favorite':'')} aria-label={(m.favorite?'Ukloni iz favorita ':'Dodaj u favorite ')+m.name} aria-pressed={!!m.favorite} onClick={()=>void toggle(m.id)}/></div>
      <Link to={'/dxf/'+m.id}><h2>{m.name}</h2></Link><p>{m.id} · {num(m.shape.width)} × {num(m.shape.height)} mm</p>
      <div className="model-meta"><span>{m.material} · {m.thickness} mm</span><Button icon={Download} variant="bare" aria-label={'Preuzmi '+m.filename} onClick={()=>download(m.raw,m.filename,'application/dxf')}/></div>
    </Card>)}</div>
    {!filtered.length&&<Empty>Nema modela za izabrane kriterijume.</Empty>}
    {model&&<Dialog wide title={model.id+' · '+model.name} onClose={()=>navigate('/dxf')}>
      <Thumbnail shape={model.shape} preview={model.preview} className="large-drawing"/>
      <p>{num(model.shape.width,2)} × {num(model.shape.height,2)} mm · {sqm(model.shape.area,3)} · {model.shape.rings.length} kontura · {model.material} {model.thickness} mm</p>
      {model.issues.length>0&&<ul className="issues">{model.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
      {!model.builtin&&<Field label="Jedinica crteža"><select value={model.unit??''} onChange={e=>{
        const unit=Number(e.target.value) as Unit;const result=parseDxf(model.raw,unit,state.settings.tolerance);
        void save(data=>{const row=data.models.find(m=>m.id===model.id);if(row)Object.assign(row,{unit,shape:result.shape,valid:result.valid,preview:result.preview,issues:result.issues});});
      }}><option value="" disabled>Potvrdi jedinicu</option>{unitLabels.map(([unit,label])=><option key={unit} value={unit}>{label}</option>)}</select></Field>}
      <div className="form-grid two"><Field label="Posao"><JobSelect value={target} onChange={setTarget}/></Field><Field label="Količina"><NumberField label="Količina modela" value={amount} min={1} max={500} step={1} onChange={v=>setAmount(Math.round(v))}/></Field></div>
      <div className="dialog-actions">
        {!model.builtin&&<Button icon={Trash2} onClick={async()=>{if(confirm('Obrisati model iz biblioteke?')&&await save(data=>{data.models=data.models.filter(m=>m.id!==model.id);},'Model je obrisan.'))navigate('/dxf');}}>Obriši model</Button>}
        <Button icon={Download} onClick={()=>download(model.raw,model.filename,'application/dxf')}>Preuzmi DXF</Button>
        <Button variant="primary" icon={Plus} disabled={!target} validateNumbers onClick={async()=>{
          if(await save(data=>{const job=data.jobs.find(j=>j.id===target);if(!job)throw new Error('Izaberite posao.');
            job.parts.push({...model,id:uid(),quantity:amount,material:job.material,thickness:job.thickness});job.nest=undefined;job.nestingAt=undefined;
            releaseReservation(data,job.id);
            data.calculations=data.calculations.filter(calc=>calc.jobId!==job.id);
            activity(data,'dxf','Dodat DXF: '+model.filename,'/poslovi/'+job.id);},'Model je dodat u posao.'))navigate('/poslovi/'+target);
        }}>Dodaj u posao</Button>
      </div>
    </Dialog>}
  </>;
}

