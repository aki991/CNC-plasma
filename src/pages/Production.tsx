import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Clock3, Download, Factory, FileType, Layers3, Play, Save, Settings, Timer, TrendingUp, UserRound, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activity, available, cutHours, dateAt, dateLabel, num, partArea, quantity, releaseReservation, setStatus, sqm } from '../data/business';
import { download } from '../data/files';
import { statuses, type Job, type State, type Status } from '../data/types';
import { sheetStats } from '../geometry/nesting';
import { Badge, Button, Card, Empty, Field, Heading, Metric, NumberField, Table, TextLink, Thumbnail } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { StatusSelect } from './Jobs';

const icons=[FileType,Layers3,Play,Settings,CheckCircle2];
const working: Status[]=['U sečenju','Zavarivanje / obrada'];
const consumable: Status[]=[...working,'Završeno'];
const minLabel=(value:number)=>Math.floor(Math.round(value)/60)+' h '+Math.round(value)%60+' min';
export function Production() {
  const {state,save}=useWorkshop();
  const navigate=useNavigate();
  const [drag,setDrag]=useState('');
  const [column,setColumn]=useState<Status>();
  const [expanded,setExpanded]=useState<Status[]>([]);
  const today=dateAt();
  const active=state.jobs.filter(job=>job.status!=='Završeno');
  const late=active.filter(job=>job.due && job.due<today);
  const done=state.jobs.filter(job=>job.completedAt===today);
  const finished=state.jobs.filter(job=>job.completedAt && job.completedAt>=dateAt(-7) && job.nest);
  const durations=finished.map(job=>{const s=sheetStats(job.nest!.sheets);return cutHours(s.length,s.pierces,state.settings)*60;});
  return <>
    <Heading icon={Factory} title="Proizvodnja" subtitle="Pregled aktivnih naloga za proizvodnju."><span className="date-pill"><CalendarDays size={18}/>{dateLabel(today)}</span></Heading>
    <div className="metrics production-metrics">
      <Metric icon={ClipboardList} label="Aktivni nalozi" value={active.length} detail={<>U proizvodnji: {active.filter(j=>working.includes(j.status)).length} <em/> U pripremi: {active.filter(j=>j.status===statuses[0]).length}</>}/>
      <Metric icon={Clock3} label="Kasni" value={late.length} detail={num(active.length?late.length/active.length*100:0,1)+' % aktivnih naloga'} tone="red"/>
      <Metric icon={CheckCircle2} label="Danas završeno" value={done.length} detail={sqm(done.reduce((sum,j)=>sum+partArea(j),0))+'  |  '+done.reduce((sum,j)=>sum+quantity(j),0)+' kom'} tone="green"/>
      <Metric icon={Timer} label="Prosečno vreme" value={durations.length?minLabel(durations.reduce((a,b)=>a+b,0)/durations.length):'—'} detail="Procena po nalogu (7 dana)" tone="purple"/>
    </div>
    <div className="kanban">
      {statuses.map((status,index)=>{
        const Icon=icons[index], list=state.jobs.filter(job=>job.status===status);
        const show=expanded.includes(status);
        return <section key={status} className={'kanban-lane lane-'+index+(column===status?' drop-active':'')} onDragOver={e=>{e.preventDefault();setColumn(status);}}
          onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setColumn(undefined);}} onDrop={e=>{
            e.preventDefault();const id=e.dataTransfer.getData('text/plain')||drag;setColumn(undefined);setDrag('');
            if(id)void save(data=>setStatus(data,id,status),'Status naloga je sačuvan.');
          }}>
          <header><Icon/><strong>{status}</strong><span>{list.length}</span></header>
          <div className="kanban-cards">{list.slice(0,show?undefined:3).map(job=><article key={job.id} className="kanban-card" draggable
            onDragStart={e=>{e.dataTransfer.setData('text/plain',job.id);e.dataTransfer.effectAllowed='move';setDrag(job.id);}}
            onDragEnd={()=>{setDrag('');setColumn(undefined);}} onClick={()=>navigate('/proizvodnja/'+job.id)}>
            <Link to={'/proizvodnja/'+job.id}><strong>{job.id} – {job.name}</strong><ArrowRight size={13}/></Link>
            <div className="kanban-info">{job.parts[0]?<Thumbnail shape={job.parts[0].shape}/>:<FileType/>}
              <div><span>Kupac: {state.customers.find(c=>c.id===job.customerId)?.name??'—'}</span><span>Rok: {dateLabel(job.due)}</span><span>Materijal: {job.material} {job.thickness} mm</span></div></div>
            <div className="progress-row"><progress max={100} value={job.progress}/><strong>{job.progress} %</strong></div>
          </article>)}</div>
          {list.length>3&&<button className="link-button lane-more" onClick={()=>setExpanded(show?expanded.filter(s=>s!==status):[...expanded,status])}>{show?'Prikaži manje':'Prikaži još '+(list.length-3)}</button>}
        </section>;
      })}
    </div>
    <div className="production-bottom">
      <Card title="Opterećenje mašina – danas" icon={TrendingUp} action={<TextLink to="/machines">Detalji o mašinama</TextLink>}>
        <Table head={['Mašina','Trenutni posao','Status','Opterećenje']}>{state.machines.map(machine=>{
          const job=active.find(j=>j.machine===machine&&working.includes(j.status));
          const planned=active.filter(j=>j.machine===machine&&j.planDate===today&&j.nest);
          const load=Math.min(100,Math.round(planned.reduce((sum,j)=>{const st=sheetStats(j.nest!.sheets);return sum+cutHours(st.length,st.pierces,state.settings)/8*100;},0)));
          return <tr key={machine}><td><Factory className="cell-icon"/> <strong>{machine}</strong></td><td>{job?<Link to={'/proizvodnja/'+job.id}>{job.id} – {job.name}</Link>:'—'}</td>
            <td>{job?<span className={'badge '+(job.status===statuses[2]?'green':'purple')}>{job.status===statuses[2]?'U radu':'Obrada'}</span>:<span className="badge">Slobodna</span>}</td>
            <td><div className="progress-row">{load} % <progress value={load} max={100}/></div></td></tr>;
        })}</Table>
      </Card>
      <Card title="Raspodela radnika – danas" icon={Users} action={<TextLink to="/podesavanja#oprema">Radnici</TextLink>}>
        <Table head={['Radnik','Aktivnost / nalog','Status','Vreme']}>{state.operators.map(name=>{
          const job=active.find(j=>j.operator===name&&working.includes(j.status));
          const st=sheetStats(job?.nest?.sheets??[]);
          return <tr key={name}><td><UserRound className="cell-icon"/> <strong>{name}</strong></td><td>{job?<Link to={'/proizvodnja/'+job.id}>{job.status===statuses[2]?'Sečenje':'Obrada'} – {job.id}</Link>:'—'}</td>
            <td><span className={'badge '+(job?'green':'')}>{job?'U radu':'Slobodan'}</span></td><td>{job?minLabel(cutHours(st.length,st.pierces,state.settings)*60):'—'}</td></tr>;
        })}</Table>
      </Card>
    </div>
  </>;
}

export function WorkOrder() {
  const {id}=useParams();
  const {state}=useWorkshop();
  const job=state.jobs.find(item=>item.id===id);
  return job?<OrderEditor job={job} key={job.id}/>:<Card><Empty>Radni nalog nije pronađen. <TextLink to="/proizvodnja">Proizvodnja</TextLink></Empty></Card>;
}
function OrderEditor({job}:{job:Job}) {
  const {state,save}=useWorkshop();
  const [form,setForm]=useState(job);
  const update=<K extends keyof Job,>(key:K,value:Job[K])=>setForm(old=>({...old,[key]:value}));
  const rows=state.reservations.filter(r=>r.jobId===job.id);
  const customer=state.customers.find(c=>c.id===job.customerId);
  const commit=()=>save(data=>{
    if((form.start||form.end)&&(!form.planDate||!form.start||!form.end||form.start>=form.end))throw new Error('Unesite datum i ispravan interval sečenja.');
    const row=data.jobs.find(item=>item.id===job.id);
    if(!row)throw new Error('Radni nalog više nije dostupan.');
    if(form.status!==row.status)setStatus(data,job.id,form.status);
    else activity(data,'job','Ažuriran radni nalog '+job.id,'/proizvodnja/'+job.id);
    Object.assign(row,{machine:form.machine,operator:form.operator,note:form.note,due:form.due,planDate:form.planDate,
      start:form.start,end:form.end,progress:form.status==='Završeno'?100:Math.min(99,form.progress)});
  },'Radni nalog je sačuvan.');
  const stockNeeds=(data:State)=>{
    const row=data.jobs.find(j=>j.id===job.id);
    if(row?.materialConsumedAt)throw new Error('Utrošak za ovaj nalog je već potvrđen.');
    if(!row?.nest?.sheets.length||row.nest.unplaced.length)throw new Error('Sačuvajte kompletan nesting pre rezervacije.');
    const proposed=new Map<string,number>();
    const own=(id:string)=>data.reservations.filter(r=>r.jobId===job.id&&r.stockId===id).reduce((s,r)=>s+r.quantity,0);
    for(const sheet of row.nest.sheets){
      const id=sheet.id?.split(':')[0];
      const stock=data.inventory.find(item=>item.material===row.material&&item.thickness===row.thickness&&
        item.width===sheet.width&&item.height===sheet.height&&
        (id?item.id===id&&item.remnant&&JSON.stringify(item.outline)===JSON.stringify(sheet.outline):!item.remnant)&&
        available(data,item)+own(item.id)>(proposed.get(item.id)??0));
      if(!stock)throw new Error('Nema dovoljno odgovarajućih tabli u magacinu.');
      proposed.set(stock.id,(proposed.get(stock.id)??0)+1);
    }
    return proposed;
  };
  return <>
    <div className="breadcrumbs"><Link to="/proizvodnja"><ArrowLeft size={15}/> Proizvodnja</Link><span>›</span><strong>{job.id}</strong></div>
    <Heading icon={ClipboardList} title={job.name} subtitle={'Radni nalog '+job.id+' · '+(customer?.name??'')}><Badge status={job.status}/><TextLink to={'/poslovi/'+job.id}>Otvori posao</TextLink></Heading>
    <div className="detail-layout">
      <Card title="Radni nalog" icon={ClipboardList}>
        <div className="form-grid two">
          <Field label="Status"><StatusSelect value={form.status} kind={job.kind} onChange={v=>update('status',v)}/></Field>
          <Field label="Završeno (%)"><NumberField label="Procenat završenosti" max={100} value={form.progress} onChange={v=>update('progress',v)}/></Field>
          <Field label="Mašina"><select value={form.machine} onChange={e=>update('machine',e.target.value)}><option value="">Bez dodele</option>{state.machines.map(m=><option key={m}>{m}</option>)}</select></Field>
          <Field label="Radnik"><select value={form.operator} onChange={e=>update('operator',e.target.value)}><option value="">Bez dodele</option>{state.operators.map(m=><option key={m}>{m}</option>)}</select></Field>
          <Field label="Rok"><input type="date" value={form.due} onChange={e=>update('due',e.target.value)}/></Field>
          <Field label="Datum planiranog sečenja"><input type="date" value={form.planDate} onChange={e=>update('planDate',e.target.value)}/></Field>
          <Field label="Početak"><input type="time" value={form.start} onChange={e=>update('start',e.target.value)}/></Field><Field label="Završetak"><input type="time" value={form.end} onChange={e=>update('end',e.target.value)}/></Field>
        </div>
        <Field label="Napomene"><textarea rows={4} value={form.note} onChange={e=>update('note',e.target.value)}/></Field>
        <div className="dialog-actions"><Button icon={Save} variant="primary" validateNumbers onClick={()=>void commit()}>Sačuvaj radni nalog</Button></div>
      </Card>
      <div className="stack">
        <Card title="Materijal i dokumentacija" icon={Layers3}>
          <p>{job.material} {job.thickness} mm · {quantity(job)} kom</p>
          <Table head={['DXF','Količina','']}>{job.parts.map(part=><tr key={part.id}><td>{part.filename}</td><td>{part.quantity} kom</td><td><Button icon={Download} variant="bare" aria-label={'Preuzmi '+part.filename} onClick={()=>download(part.raw,part.filename,'application/dxf')}/></td></tr>)}</Table>
          <TextLink to={'/nesting/'+job.id}>{job.nest?'Otvori nesting raspored':'Pripremi nesting'}</TextLink>
        </Card>
        <Card title="Rezervacija i utrošak" icon={Layers3}>
          {rows.length?<Table head={['Lokacija','Rezervisano']}>{rows.map(r=><tr key={r.stockId}><td>{state.inventory.find(s=>s.id===r.stockId)?.location}</td><td>{r.quantity} kom</td></tr>)}</Table>:<p>{job.materialConsumedAt?'Utrošak potvrđen '+dateLabel(job.materialConsumedAt):'Nema aktivne rezervacije.'}</p>}
          <div className="dialog-actions">
            <Button disabled={!job.nest||job.status==='Završeno'||!!job.materialConsumedAt} onClick={()=>void save(data=>{
              const proposed=stockNeeds(data);data.reservations=data.reservations.filter(r=>r.jobId!==job.id);
              data.reservations.push(...[...proposed].map(([stockId,quantity])=>({jobId:job.id,stockId,quantity})));
              activity(data,'stock','Rezervisan materijal za '+job.id,'/magacin');
            },'Materijal je rezervisan.')}>Rezerviši table</Button>
            <Button disabled={!rows.length} onClick={()=>void save(data=>releaseReservation(data,job.id),'Rezervacija je oslobođena.')}>Oslobodi</Button>
            <Button variant="primary" disabled={!rows.length||!consumable.includes(job.status)} onClick={()=>{
              if(confirm('Potvrditi utrošak rezervisanih tabli?'))void save(data=>{
                const current=data.jobs.find(j=>j.id===job.id);
                if(!current||!consumable.includes(current.status))throw new Error('Sačuvajte status proizvodne operacije.');
                if(current.materialConsumedAt)throw new Error('Utrošak za ovaj nalog je već potvrđen.');
                const reservations=data.reservations.filter(r=>r.jobId===job.id);
                if(!reservations.length)throw new Error('Nema aktivne rezervacije.');
                for(const r of reservations){
                  const stock=data.inventory.find(item=>item.id===r.stockId);
                  if(!stock||stock.quantity<r.quantity)throw new Error('Stanje magacina je promenjeno.');
                  stock.quantity-=r.quantity;
                }
                data.reservations=data.reservations.filter(r=>r.jobId!==job.id);
                current.materialConsumedAt=dateAt();
                activity(data,'stock','Potvrđen utrošak materijala za '+job.id,'/magacin');
              },'Magacin je razdužen.');
            }}>Potvrdi utrošak</Button>
          </div>
        </Card>
      </div>
    </div>
  </>;
}

