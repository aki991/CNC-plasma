import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Box, Building2, Calculator, ClipboardList, Database, Download, Factory, FileType, MapPin, PackagePlus, Pencil, Plus, Save, Settings as Gear, Trash2, Upload, UserRound, Users } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { activity, available, dateLabel, nextId, num, reserved, rsd, uid } from '../data/business';
import { restore } from '../data/db';
import { checkSpace, download } from '../data/files';
import type { Customer, Inventory, State } from '../data/types';
import { parseDxf } from '../geometry/dxf';
import { Badge, Button, Card, Dialog, Empty, Field, Heading, NumberField, Table, TextLink } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { searchKey } from '../ui/shell';
import { MaterialSelect } from './Jobs';

export function Customers() {
  const {state,save}=useWorkshop();
  const {id}=useParams();
  const navigate=useNavigate();
  const customer=state.customers.find(c=>c.id===id);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [edit,setEdit]=useState<Customer>();
  const rows=state.customers.filter(c=>searchKey([c.name,c.contact,c.email,c.phone,c.address].join(' ')).includes(searchKey(query))&&
    (filter==='all'||(filter==='active'?state.jobs.some(j=>j.customerId===c.id&&j.status!=='Završeno'):!state.jobs.some(j=>j.customerId===c.id))));
  const start=()=>setEdit({id:'',name:'',contact:'',email:'',phone:'',address:'',taxId:''});
  const commit=async(e:FormEvent)=>{
    e.preventDefault();
    if(!edit)return;
    let id=edit.id;
    if(await save(data=>{
      if(!edit.name.trim())throw new Error('Unesite naziv kupca.');
      id ||= nextId('K-',data.customers.map(c=>c.id),1);
      const row={...edit,id,name:edit.name.trim()};
      data.customers=data.customers.filter(c=>c.id!==id);
      data.customers.unshift(row);
      activity(data,'customer',(edit.id?'Ažuriran kupac: ':'Dodat kupac: ')+row.name,'/kupci/'+id);
    },'Kupac je sačuvan.')){setEdit(undefined);navigate('/kupci/'+id);}
  };
  const jobs=state.jobs.filter(j=>j.customerId===customer?.id);
  const quotes=state.quotes.filter(q=>q.customer.id===customer?.id);
  return <>
    <Heading icon={Users} title={customer?.name??'Kupci'} subtitle={customer?'Kontakt, poslovi i ponude kupca.':'Kontakti i istorija saradnje sa kupcima.'}>
      {customer?<><TextLink to="/kupci">Svi kupci</TextLink><Link className="button primary" to={'/poslovi/novi?kupac='+customer.id}><Plus/>Novi posao</Link></>:
        <Button variant="primary" icon={Plus} onClick={start}>Dodaj kupca</Button>}
    </Heading>
    {customer?<div className="detail-layout">
      <Card title="Podaci o kupcu" icon={UserRound} action={<Button variant="bare" icon={Pencil} onClick={()=>setEdit(customer)}>Uredi</Button>}>
        <dl className="profile-data">{([['Kontakt',customer.contact],['Telefon',customer.phone],['E-mail',customer.email],['Adresa',customer.address],['PIB',customer.taxId],
          ['Vrednost prihvaćenih ponuda',rsd(quotes.filter(q=>q.status==='Prihvaćena').reduce((sum,q)=>sum+q.total,0))]]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
      </Card>
      <div className="stack">
        <Card title="Istorija poslova" icon={ClipboardList}><Table head={['Posao','Rok','Status']}>{jobs.map(job=><tr key={job.id}><td><TextLink to={'/poslovi/'+job.id}>{job.id} · {job.name}</TextLink></td><td>{dateLabel(job.due)}</td><td><Badge status={job.status}/></td></tr>)}</Table>{!jobs.length&&<Empty>Kupac još nema poslova.</Empty>}</Card>
        <Card title="Istorija ponuda" icon={FileType}><Table head={['Ponuda','Status','Vrednost']}>{quotes.map(q=><tr key={q.id}><td><TextLink to={'/ponude/'+q.id}>{q.id}</TextLink></td><td>{q.status}</td><td>{rsd(q.total)}</td></tr>)}</Table>{!quotes.length&&<Empty>Kupac još nema ponuda.</Empty>}</Card>
      </div>
    </div>:<Card title="Evidencija kupaca" icon={Users} action={<span className="count">{rows.length}</span>}>
      <div className="toolbar"><input aria-label="Pretraga kupaca" placeholder="Pretraži kupce..." value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Filter kupaca" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">Svi kupci</option><option value="active">Sa aktivnim poslovima</option><option value="empty">Bez poslova</option></select></div>
      <Table head={['Naziv','Kontakt','Telefon','E-mail','Adresa','Poslovi']}>{rows.map(c=><tr className="click-row" key={c.id} onClick={()=>navigate('/kupci/'+c.id)}>
        <td><Link to={'/kupci/'+c.id}><strong>{c.name}</strong></Link></td><td>{c.contact}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.address}</td>
        <td>{state.jobs.filter(j=>j.customerId===c.id).length}</td></tr>)}</Table>{!rows.length&&<Empty>Nema kupaca za izabrane kriterijume.</Empty>}
    </Card>}
    {edit&&<Dialog title={edit.id?'Uredi kupca':'Novi kupac'} onClose={()=>setEdit(undefined)}>
      <form onSubmit={commit}><div className="form-grid two">{([['name','Naziv kupca'],['contact','Kontakt osoba'],['phone','Telefon'],['email','E-mail'],['address','Adresa'],['taxId','PIB']] as const).map(([key,label])=>
        <Field key={key} label={label} required={key==='name'}><input required={key==='name'} type={key==='email'?'email':key==='phone'?'tel':'text'} value={edit[key]} onChange={e=>setEdit({...edit,[key]:e.target.value})}/></Field>)}</div>
        <div className="dialog-actions"><Button type="submit" variant="primary" icon={Save}>Sačuvaj kupca</Button></div></form>
    </Dialog>}
  </>;
}

export function InventoryPage() {
  const {state,save,run}=useWorkshop();
  const [query,setQuery]=useState('');
  const [type,setType]=useState('all');
  const [edit,setEdit]=useState<Inventory>();
  const rows=state.inventory.filter(s=>(type==='all'||s.remnant===(type==='remnant'))&&searchKey(s.material+' '+s.thickness+' '+s.supplier+' '+s.location).includes(searchKey(query)));
  const start=()=>setEdit({id:'',material:'Čelik S235',thickness:5,width:3000,height:1500,quantity:1,cost:0,supplier:'',location:'',remnant:false});
  const commit=async(e:FormEvent)=>{
    e.preventDefault();
    if(!edit)return;
    if(await save(data=>{
      const before=data.inventory.find(s=>s.id===edit.id);
      const id=edit.id||nextId('M-',data.inventory.map(s=>s.id),1);
      if(edit.quantity<reserved(data,id))throw new Error('Količina je manja od rezervisanog stanja.');
      if(before&&reserved(data,id)>0&&(['material','thickness','width','height','remnant'].some(key=>before[key as keyof Inventory]!==edit[key as keyof Inventory])||
        JSON.stringify(before.outline)!==JSON.stringify(edit.outline)))
        throw new Error('Oslobodite rezervacije pre promene specifikacije.');
      data.inventory=data.inventory.filter(s=>s.id!==id);
      data.inventory.unshift({...edit,id});
      activity(data,'stock',(before?'Ažurirano stanje: ':'Prijem materijala: ')+edit.material+' '+edit.thickness+' mm ('+edit.quantity+' kom)','/magacin');
    },'Stanje materijala je sačuvano.'))setEdit(undefined);
  };
  return <>
    <Heading icon={Box} title="Magacin" subtitle="Stanje tabli, ostaci, rezervacije i raspoloživi materijal."><Button variant="primary" icon={PackagePlus} onClick={start}>Dodaj materijal</Button></Heading>
    <Card title="Stanje materijala" icon={Box}>
      <div className="toolbar"><input aria-label="Pretraga magacina" placeholder="Pretraži materijal, dobavljača ili lokaciju..." value={query} onChange={e=>setQuery(e.target.value)}/>
        <select aria-label="Vrsta zalihe" value={type} onChange={e=>setType(e.target.value)}><option value="all">Sve zalihe</option><option value="new">Nove table</option><option value="remnant">Ostaci</option></select></div>
      <Table head={['Materijal','Dimenzije (mm)','Na stanju','Rezervisano','Raspoloživo','Nabavna cena / kom','Dobavljač','Lokacija','']}>{rows.map(s=><tr key={s.id}>
        <td><strong>{s.material} {s.thickness} mm</strong>{s.remnant&&<small className="block">Ostatak{s.outline?' · DXF kontura':''}</small>}</td><td>{num(s.width)} × {num(s.height)}</td>
        <td>{s.quantity} kom</td><td>{reserved(state,s.id)} kom</td><td className="green-text"><strong>{available(state,s)} kom</strong></td><td>{rsd(s.cost)}</td><td>{s.supplier||'—'}</td><td><MapPin className="cell-icon"/> {s.location||'—'}</td>
        <td><Button icon={Pencil} variant="bare" aria-label={'Uredi '+s.id} onClick={()=>setEdit(s)}/></td>
      </tr>)}</Table>{!rows.length&&<Empty>Nema zaliha za izabrane kriterijume.</Empty>}
    </Card>
    <Card title="Rezervacije po nalozima" icon={ClipboardList}><Table head={['Radni nalog','Materijal','Lokacija','Količina']}>{state.reservations.map(r=>{
      const stock=state.inventory.find(s=>s.id===r.stockId);return <tr key={r.jobId+r.stockId}><td><TextLink to={'/proizvodnja/'+r.jobId}>{r.jobId}</TextLink></td><td>{stock?.material} {stock?.thickness} mm</td><td>{stock?.location}</td><td>{r.quantity} kom</td></tr>;
    })}</Table>{!state.reservations.length&&<Empty>Nema aktivnih rezervacija.</Empty>}</Card>
    {edit&&<Dialog title={edit.id?'Uredi stanje materijala':'Dodaj materijal'} onClose={()=>setEdit(undefined)}>
      <form onSubmit={commit}><div className="form-grid two">
        <Field label="Materijal"><MaterialSelect value={edit.material} onChange={v=>setEdit({...edit,material:v})}/></Field>
        <Field label="Vrsta"><select value={String(edit.remnant)} onChange={e=>setEdit({...edit,remnant:e.target.value==='true',outline:undefined})}><option value="false">Nova tabla</option><option value="true">Ostatak</option></select></Field>
        {([['thickness','Debljina (mm)',.1],['width','Širina (mm)',1],['height','Visina (mm)',1],['quantity','Količina',0],['cost','Nabavna cena / kom',0]] as const).map(([key,label,min])=>
          <Field label={label} key={key}><NumberField label={label} min={min} max={key==='cost'?1e9:30000} value={edit[key]} step={key==='quantity'?1:'any'} onChange={v=>setEdit({...edit,[key]:key==='quantity'?Math.round(v):v,outline:key==='width'||key==='height'?undefined:edit.outline})}/></Field>)}
        <Field label="Dobavljač"><input value={edit.supplier} onChange={e=>setEdit({...edit,supplier:e.target.value})}/></Field>
        <Field label="Lokacija"><input value={edit.location} onChange={e=>setEdit({...edit,location:e.target.value})}/></Field>
        {edit.remnant&&<Field label="DXF kontura ostatka"><input type="file" accept=".dxf" onChange={e=>{
          const file=e.target.files?.[0];if(!file)return;
          void run(async()=>{if(file.size>8e6)throw new Error('DXF fajl je prevelik.');
            const result=parseDxf(await file.text(),undefined,state.settings.tolerance);
            if(!result.valid||result.shape.rings.length!==1)throw new Error('Ostatak zahteva jednu zatvorenu spoljnu konturu sa definisanim jedinicama.');
            setEdit({...edit,width:result.shape.width,height:result.shape.height,outline:result.shape.rings[0]});});
        }}/></Field>}
      </div><div className="dialog-actions"><Button variant="primary" type="submit" icon={Save}>Sačuvaj materijal</Button></div></form>
    </Dialog>}
  </>;
}

type InstallEvent = Event & { prompt: () => Promise<unknown>; userChoice: Promise<{ outcome: string }> };
export function SettingsPage({ install, onInstall }: { install: InstallEvent|null; onInstall:()=>void }) {
  const {state,save,run}=useWorkshop();
  const {hash}=useLocation();
  const [settings,setSettings]=useState(state.settings);
  const [prices,setPrices]=useState(state.prices);
  const [machines,setMachines]=useState(state.machines);
  const [operators,setOperators]=useState(state.operators);
  const [storage,setStorage]=useState<StorageEstimate>();
  const backup=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(hash==='#oprema')document.getElementById('oprema')?.scrollIntoView();},[hash]);
  useEffect(()=>{void navigator.storage?.estimate?.().then(setStorage);},[]);
  const commit=()=>save(data=>{
    const cleaned=[machines.map(m=>m.trim()),operators.map(o=>o.trim())];
    if(!settings.company.trim()||!settings.user.trim())throw new Error('Naziv firme i ime korisnika su obavezni.');
    if(cleaned.some(list=>list.some(x=>!x)||new Set(list).size!==list.length))throw new Error('Unesite jedinstvene nazive bez praznih redova.');
    data.jobs.forEach(job=>{
      job.machine=job.machine?cleaned[0][data.machines.indexOf(job.machine)]??'':'';
      job.operator=job.operator?cleaned[1][data.operators.indexOf(job.operator)]??'':'';
    });
    Object.assign(data,{settings,prices,machines:cleaned[0],operators:cleaned[1]});
  },'Podešavanja su sačuvana.');
  return <>
    <Heading icon={Gear} title="Podešavanja" subtitle="Profil radionice, cenovnik, oprema i lokalni podaci."><Button variant="primary" icon={Save} validateNumbers onClick={()=>void commit()}>Sačuvaj podešavanja</Button></Heading>
    <div className="detail-layout">
      <div className="stack">
        <Card title="Firma i korisnik" icon={Building2}><div className="form-grid two">
          {([['company','Naziv firme'],['user','Ime korisnika'],['address','Adresa'],['taxId','PIB']] as const).map(([key,label])=><Field key={key} label={label}><input value={settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.value})}/></Field>)}
        </div></Card>
        <Card title="Parametri sečenja" icon={Gear}><div className="form-grid three">
          {([['tolerance','DXF tolerancija (mm)',.001,10],['speed','Brzina sečenja (mm/min)',1,100000],['pierceSeconds','Vreme probijanja (s)',0,180]] as const).map(([key,label,min,max])=><Field key={key} label={label}><NumberField label={label} min={min} max={max} value={settings[key]} onChange={v=>setSettings({...settings,[key]:v})}/></Field>)}
        </div></Card>
        <div id="oprema"><Card title="Mašine i operateri" icon={Factory}>
          <div className="form-grid two">
            {([{title:'Mašine',list:machines,set:setMachines},{title:'Operateri',list:operators,set:setOperators}]).map(group=><div className="stack" key={group.title}>
              <strong>{group.title}</strong>{group.list.map((name,i)=><div className="inline-actions" key={i}>
                <input aria-label={group.title+' '+(i+1)} value={name} onChange={e=>group.set(group.list.map((v,j)=>i===j?e.target.value:v))}/>
              </div>)}<Button icon={Plus} onClick={()=>group.set([...group.list,''])}>Dodaj</Button></div>)}
          </div>
        </Card></div>
        <Card title="Instalacija i rezervna kopija" icon={Database}>
          <p>{storage?.quota?num((storage.usage??0)/1e6,1)+' MB iskorišćeno od '+num(storage.quota/1e6,0)+' MB.':'Podaci se čuvaju u ovom Chrome profilu.'}</p>
          <div className="inline-actions wrap">
            {install&&<Button icon={Download} onClick={onInstall}>Instaliraj aplikaciju</Button>}
            <Button icon={Download} onClick={()=>download(JSON.stringify(state),'cnc-cut-pro-kopija.json','application/json')}>Izvezi kopiju</Button>
            <Button icon={Upload} onClick={()=>backup.current?.click()}>Uvezi kopiju</Button>
            <Button icon={Database} onClick={()=>void run(async()=>{
              if(!await navigator.storage?.persist?.())throw new Error('Pregledač trenutno ne odobrava trajno skladište.');
            },'Trajno skladište je odobreno.')}>Zatraži trajno čuvanje</Button>
          </div>
          <input type="file" ref={backup} accept=".json,application/json" aria-label="Uvoz rezervne kopije" className="visually-hidden" onChange={e=>{
            const file=e.target.files?.[0];e.target.value='';if(!file||!confirm('Zameniti lokalne podatke ovom rezervnom kopijom?'))return;
            void run(async()=>{await checkSpace(file.size);const data=JSON.parse(await file.text()) as State;await restore(data);window.location.reload();});
          }}/>
        </Card>
      </div>
      <Card title="Cenovnik" icon={Calculator}>
        <Table head={['Stavka','Jedinica','Cena (RSD)']}>{prices.map((price,i)=><tr key={price.key}><td><strong>{price.name}</strong></td><td>{price.unit}</td>
          <td className="rate-cell"><NumberField label={'Cenovnik – '+price.name} max={1e9} value={price.rate} onChange={v=>setPrices(prices.map((p,j)=>i===j?{...p,rate:v}:p))}/></td></tr>)}</Table>
      </Card>
    </div>
  </>;
}

