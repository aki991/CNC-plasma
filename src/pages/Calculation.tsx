import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, Box, Calculator, CalendarDays, ClipboardList, Coins, Download, FileText, Info, Layers3, List, Mail, MapPin, Package, Percent, Phone, Plus, Ruler, Save, Timer, Truck, UserRound, Wrench, Workflow } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activity, calculation, createQuote, dateLabel, num, quantity, rsd, sqm, totals } from '../data/business';
import { downloadQuote } from '../data/files';
import type { Calculation as Calc, Job, Quote } from '../data/types';
import { sheetStats } from '../geometry/nesting';
import { duration } from '../machines/calendar';
import { readJobRuns } from '../machines/service';
import { Button, Card, Dialog, Empty, Field, Heading, NumberField, Table, TextLink, Thumbnail } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { JobSelect } from './Jobs';

const lineIcons: Record<string, typeof Box> = { sheet: Layers3, cut: Workflow, pierce: Workflow, finish: Wrench, waste: Layers3, overhead: Timer,
  frame: Box, posts: Box, hardware: Wrench, weld: Workflow, coat: Workflow, install: Wrench, delivery: Truck };
const primaryKeys = new Set(['sheet','cut','finish','frame','coat','install','delivery']);
export function Calculations() {
  const { state }=useWorkshop();
  const { id }=useParams();
  const job=id?state.jobs.find(j=>j.id===id):state.jobs.find(j=>j.nest&&j.status!=='Završeno')??state.jobs[0];
  if(!job)return <><Heading icon={Calculator} title="Kalkulacija i ponuda" subtitle="Odredite prodajnu cenu na osnovu troškova proizvodnje."/><Card><Empty>Izaberite postojeći posao. <TextLink to="/poslovi">Poslovi</TextLink></Empty></Card></>;
  return <CalcEditor job={job} key={job.id}/>;
}

function CalcEditor({job}:{job:Job}) {
  const {state,save,run}=useWorkshop();
  const navigate=useNavigate();
  const [calc,setCalc]=useState(()=>state.calculations.find(c=>c.jobId===job.id)??calculation(state,job));
  const [perUnit,setPerUnit]=useState(false);
  const [notes,setNotes]=useState(false);
  const [created,setCreated]=useState<Quote>();
  const [busy,setBusy]=useState(false);
  const machineRuns = useLiveQuery(()=>readJobRuns(job.id),[job.id],[]);
  const customer=state.customers.find(c=>c.id===job.customerId);
  const product=job.parts[0];
  const count=quantity(job);
  const factor=perUnit ? Math.max(1,count) : 1;
  const stats=sheetStats(job.nest?.sheets??[]);
  const amount=totals(calc);
  const display=(value:number)=>rsd(value/factor);
  const patch=<K extends keyof Calc,>(key:K,value:Calc[K])=>setCalc(old=>({...old,[key]:value}));
  const saveCalc=(data:typeof state)=>{
    data.calculations=data.calculations.filter(item=>item.jobId!==job.id);
    data.calculations.push({...calc,updatedAt:new Date().toISOString()});
  };
  const makeQuote=async()=>{
    setBusy(true);
    let quote:Quote|undefined;
    if(await save(data=>{
      const current=data.jobs.find(j=>j.id===job.id);
      if(!current)throw new Error('Posao nije pronađen.');
      quote=createQuote(data,current,calc);saveCalc(data);data.quotes.unshift(quote);
      activity(data,'quote','Kreirana ponuda br. '+quote.id,'/ponude/'+quote.id);
    },'Ponuda je sačuvana.'))setCreated(quote);
    setBusy(false);
  };
  const priceRow=(line:Calc['lines'][number])=>{
    const Icon=lineIcons[line.key]??Box;
    const updateLine=(values:Partial<typeof line>)=>patch('lines',calc.lines.map(l=>l.key===line.key?{...l,...values}:l));
    return <div className="cost-row" key={line.key}>
      <span className="metric-icon blue"><Icon/></span><div><strong>{line.name}</strong><small>{line.key==='sheet'?job.material+' · '+job.thickness+' mm':line.unit}</small></div>
      <Field label="Količina"><NumberField label={'Količina – '+line.name} value={Number((line.quantity/factor).toFixed(4))} max={1e7} onChange={v=>updateLine({quantity:v*factor})}/></Field>
      <Field label={'Cena / '+line.unit}><NumberField label={'Cena – '+line.name} value={line.rate} max={1e9} onChange={v=>updateLine({rate:v})}/></Field>
      <div className="cost-subtotal"><small>Međuzbir</small><strong>{display(line.quantity*line.rate)}</strong></div>
    </div>;
  };
  const extra=calc.lines.filter(line=>!primaryKeys.has(line.key));
  return <>
    <Heading icon={Calculator} title="Kalkulacija i ponuda" subtitle="Izrada kalkulacije, određivanje prodajne cene i generisanje ponude za kupca.">
      <JobSelect value={job.id} onChange={id=>navigate('/kalkulacije/'+id)}/><Link className="button" to="/ponude"><FileText/>Ponude</Link>
    </Heading>
    <div className="calc-layout">
      <div className="stack">
        <Card title="Podaci o kupcu i projektu" icon={UserRound} action={<TextLink arrow={false} to={'/poslovi/'+job.id}>Uredi</TextLink>}>
          <dl className="profile-data">
            <div><dt><UserRound/>Kupac</dt><dd>{customer?<Link to={'/kupci/'+customer.id}>{customer.name}</Link>:'—'}</dd></div>
            <div><dt><Phone/>Kontakt</dt><dd>{customer?.phone||job.contact||'—'}</dd></div><div><dt><Mail/>E-mail</dt><dd>{customer?.email||'—'}</dd></div>
            <div><dt><ClipboardList/>Projekat</dt><dd>{job.name}</dd></div><div><dt><MapPin/>Lokacija</dt><dd>{customer?.address||'—'}</dd></div>
            <div><dt><CalendarDays/>Rok isporuke</dt><dd>{dateLabel(job.due)}</dd></div>
          </dl>
        </Card>
        {!!machineRuns.length&&<Card title="Izvršavanje CNC programa" icon={Timer} action={<span className="badge blue">Simulacija</span>}>
          <dl className="profile-data dense">
            <div><dt>Završeni programi</dt><dd>{machineRuns.length}</dd></div>
            <div><dt>Planirano izvršavanje</dt><dd>{duration(machineRuns.reduce((sum,item)=>sum+item.plannedSeconds,0))}</dd></div>
            <div><dt>Izmereno izvršavanje</dt><dd>{duration(machineRuns.reduce((sum,item)=>sum+item.workSeconds,0))}</dd></div>
            <div><dt>Aktivno rezanje</dt><dd>{duration(machineRuns.reduce((sum,item)=>sum+item.cutSeconds,0))}</dd></div>
          </dl>
          <TextLink to="/machines">CNC mašine</TextLink>
        </Card>}
        <Card title="Odabrani proizvod(i)" icon={Package} action={<TextLink to={'/poslovi/'+job.id}>Promeni</TextLink>}>
          {product?<><div className="product-visual"><Thumbnail shape={product.shape}/></div><h3>{product.name}</h3><p className="muted small">{job.material}, debljina {job.thickness} mm · {num(product.shape.width)} × {num(product.shape.height)} mm</p></>:<Empty>Posao još nema DXF delove.</Empty>}
          <dl className="profile-data dense"><div><dt><Package/>Količina delova</dt><dd>{count} kom</dd></div><div><dt><Layers3/>Table za sečenje</dt><dd>{job.nest?.sheets.length??0} kom</dd></div>
            <div><dt><Ruler/>Dužina rezanja</dt><dd>{num(stats.length/1000,2)} m</dd></div><div><dt><Workflow/>Tip projekta</dt><dd><span className="badge blue">{job.kind==='cnc'?'CNC usluga':'Kompletan proizvod'}</span></dd></div></dl>
          {job.fence&&<details className="cost-extra">
            <summary>Mere ograde · {job.fence.name}</summary>
            <dl className="profile-data dense">
              <div><dt>Dužina ograde</dt><dd>{num(job.fence.length/1000,3)} m</dd></div>
              <div><dt>Stubovi</dt><dd>{job.fence.postCount} kom</dd></div>
              <div><dt>Paneli / limeni delovi</dt><dd>{job.fence.panelCount} / {job.fence.sheetPartCount}</dd></div>
              <div><dt>Svetli otvori</dt><dd>{job.fence.segmentWidths.map(width=>num(width,3)).join(' / ')} mm</dd></div>
            </dl>
          </details>}
        </Card>
      </div>
      <Card title="Kalkulacija – elementi cene" icon={Layers3} className="calc-lines" action={<div className="toggle-segment">
        <button type="button" className={perUnit?'active':''} onClick={()=>setPerUnit(true)}>Po jedinici</button><button type="button" className={!perUnit?'active':''} onClick={()=>setPerUnit(false)}>Ukupno za projekat</button>
      </div>}>
        <div className="cost-rows">{calc.lines.filter(line=>primaryKeys.has(line.key)).map(priceRow)}
        {!!extra.length&&<details className="cost-extra"><summary>Probijanje, otpad i ostale stavke ({extra.length}) <strong>{display(extra.reduce((sum,line)=>sum+line.rate*line.quantity,0))}</strong></summary><div className="cost-rows">{extra.map(priceRow)}</div></details>}
        <div className="cost-row margin-row"><span className="metric-icon green"><Percent/></span><div><strong>Marža</strong><small>Planirana dodatna zarada</small></div>
          <Field label="Stopa (%)"><NumberField label="Marža" value={calc.margin} max={1000} onChange={v=>patch('margin',v)}/></Field><span/><div className="cost-subtotal"><small>Subtotal</small><strong>{display(amount.profit)}</strong></div>
        </div></div>
      </Card>
      <Card title="Rezime kalkulacije" icon={Calculator} className="calc-summary">
        <dl className="summary-list"><div><dt>Ukupni trošak (bez marže)</dt><dd>{display(amount.cost)}</dd></div><div><dt>Marža ({num(calc.margin,1)} %)</dt><dd>{display(amount.profit)}</dd></div>
          <div><dt>Prodajna cena</dt><dd>{display(amount.sale)}</dd></div>
          <div><dt><Field label="Popust (%)"><NumberField label="Popust" value={calc.discount} max={100} onChange={v=>patch('discount',v)}/></Field></dt><dd className="green-text">−{display(amount.discount)}</dd></div>
          <div><dt>Osnovica</dt><dd>{display(amount.base)}</dd></div><div><dt><Field label="PDV (%)"><NumberField label="PDV" value={calc.vat} max={100} onChange={v=>patch('vat',v)}/></Field></dt><dd>{display(amount.vat)}</dd></div></dl>
        <div className="offer-total"><Coins/><div><strong>{perUnit?'Ponuda po jedinici':'Ukupna ponuda'}</strong><b>{display(amount.total)}</b></div></div>
        <div className="quote-kpis"><div><Ruler/><small>Cena / m²</small><strong>{stats.area?rsd(amount.base/(stats.area/1e6)):'—'}</strong></div><div><Layers3/><small>Iskorišćenost</small><strong>{num(stats.yield,1)} %</strong></div><div><Percent/><small>Marža</small><strong>{num(calc.margin,1)} %</strong></div></div>
        <div className="notice"><Info size={17}/><div><strong>Napomena za ponudu</strong><p>{calc.note||'Dodajte napomenu i rok važenja ponude.'}</p></div><Button variant="bare" onClick={()=>setNotes(true)}>Uredi</Button></div>
        {job.nest&&<p className="calc-source">Raspored · {stats.count} kom · {sqm(stats.total,2)} · {stats.pierces} probijanja</p>}
        <Button variant="bare" icon={Layers3} onClick={()=>{const fresh=calculation(state,job);setCalc({...calc,lines:fresh.lines});}}>Učitaj iz nestinga i cenovnika</Button>
      </Card>
    </div>
    <Card title="Stavke kalkulacije" icon={List} className="calc-item-table">
      <Table head={['#','Opis stavke','Jedinica mere','Količina','Cena (RSD)','Iznos (RSD)']}>{calc.lines.filter(line=>line.quantity>0).map((line,i)=><tr key={line.key}>
        <td>{i+1}</td><td>{line.name}</td><td>{line.unit}</td><td>{num(line.quantity/factor,2)}</td><td>{num(line.rate,2)}</td><td>{num(line.quantity*line.rate/factor,2)}</td>
      </tr>)}</Table>
    </Card>
    <div className="page-footer"><Link className="button" to={'/nesting/'+job.id}><ArrowLeft/>Nazad na nesting</Link><div>
      <Button icon={Save} validateNumbers onClick={()=>void save(saveCalc,'Kalkulacija je sačuvana.')}>Sačuvaj kalkulaciju</Button>
      <Button variant="primary" icon={Plus} disabled={busy} validateNumbers onClick={()=>void makeQuote()}>Kreiraj ponudu</Button></div>
    </div>
    {notes&&<Dialog title="Napomena i važenje ponude" onClose={()=>setNotes(false)}><div className="stack">
      <Field label="Napomena"><textarea rows={5} value={calc.note} onChange={e=>patch('note',e.target.value)}/></Field>
      <Field label="Važenje (dana)"><NumberField label="Rok važenja" value={calc.validity} min={1} max={365} step={1} onChange={v=>patch('validity',Math.round(v))}/></Field>
      <Button variant="primary" validateNumbers onClick={()=>setNotes(false)}>Primeni</Button></div></Dialog>}
    {created&&<Dialog title={created.id+' · Ponuda je kreirana'} onClose={()=>setCreated(undefined)}><p>{created.customer.name} · {rsd(created.total)}</p>
      <div className="dialog-actions"><Link className="button" to={'/ponude/'+created.id}><ArrowRight/>Otvori ponudu</Link>
        <Button variant="primary" icon={Download} onClick={()=>void run(()=>downloadQuote(created))}>Generiši PDF</Button></div>
    </Dialog>}
  </>;
}

export function Quotes() {
  const {state,save,run}=useWorkshop();
  const {id}=useParams();
  const navigate=useNavigate();
  const quote=state.quotes.find(q=>q.id===id);
  return <>
    <Heading icon={FileText} title="Ponude" subtitle="Sačuvane ponude, rokovi važenja i PDF dokumenti."><Link className="button" to="/kalkulacije"><Calculator/>Kalkulacije</Link></Heading>
    <Card title="Evidencija ponuda" icon={FileText}><Table head={['Ponuda','Posao','Kupac','Datum','Važi do','Status','Ukupno','']}>
      {state.quotes.map(q=><tr key={q.id}><td><Link className="text-link" to={'/ponude/'+q.id}>{q.id}</Link></td><td>{q.jobName}</td><td>{q.customer.name}</td><td>{dateLabel(q.date)}</td>
        <td>{dateLabel(q.expires)}</td><td><span className={'badge '+(q.status==='Prihvaćena'?'green':q.status==='Odbijena'?'amber':'blue')}>{q.status}</span></td><td><strong>{rsd(q.total)}</strong></td>
        <td><Button icon={Download} variant="bare" aria-label={'PDF '+q.id} onClick={()=>void run(()=>downloadQuote(q))}/></td></tr>)}
    </Table>{!state.quotes.length&&<Empty>Nema sačuvanih ponuda.</Empty>}</Card>
    {quote&&<Dialog wide title={quote.id+' · '+quote.jobName} onClose={()=>navigate('/ponude')}>
      <div className="form-grid two"><p><strong>{quote.customer.name}</strong><br/>{quote.customer.email}</p>
        <Field label="Status ponude"><select value={quote.status} onChange={e=>void save(data=>{const row=data.quotes.find(q=>q.id===quote.id);if(row){row.status=e.target.value as Quote['status'];activity(data,'quote',row.id+' · '+row.status,'/ponude/'+row.id);}},'Status ponude je sačuvan.')}>
          <option>Otvorena</option><option>Prihvaćena</option><option>Odbijena</option></select></Field></div>
      <Table head={['Stavka','Količina','Cena']}>{quote.lines.map(line=><tr key={line.key}><td>{line.name}</td><td>{line.quantity} {line.unit}</td><td>{rsd(line.rate)}</td></tr>)}</Table>
      <p>Važi do {dateLabel(quote.expires)} · PDV {rsd(quote.vatAmount)}</p><h2>{rsd(quote.total)}</h2>
      {quote.note&&<p>{quote.note}</p>}
      <div className="dialog-actions"><Button variant="primary" icon={Download} onClick={()=>void run(()=>downloadQuote(quote))}>Preuzmi PDF</Button></div>
    </Dialog>}
  </>;
}

