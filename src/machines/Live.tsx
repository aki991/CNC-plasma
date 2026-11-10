import { useState, type ReactNode } from 'react';
import { ArrowRight, Cable, Check, ClipboardList, Cpu, Gauge, Pause, Play, RotateCcw, TriangleAlert, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cutHours, num } from '../data/business';
import type { Job } from '../data/types';
import { sheetStats, type Sheet } from '../geometry/nesting';
import { pathData } from '../geometry/polygon';
import { Button, Card, Dialog, Field, TextLink } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { duration, timeLabel } from './calendar';
import { telemetryService } from './service';
import type { SimulatorAction, SimulatorState } from './simulator';
import { machines, type MachineId, type MachineTelemetry } from './types';

export function Details({ rows }: { rows: [string,ReactNode][] }) {
  return <dl className="machine-data">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??'—'}</dd></div>)}</dl>;
}
const statusLabels = { running:['U radu','green'], idle:['Čeka posao','blue'], paused:['Pauza','amber'],
  alarm:['Alarm','red'], completed:['Završeno','green'], unknown:['Nepoznato',''], offline:['Offline',''] };
export function MachineStatus({ telemetry }: { telemetry: MachineTelemetry }) {
  const [label,tone] = statusLabels[telemetry.connectionState==='offline'?'offline':telemetry.operatingState];
  return <span className={'badge machine-status '+tone}><span className="status-dot"/>{label}</span>;
}
export function Connection({ telemetry }: { telemetry: MachineTelemetry }) {
  return <span className={'machine-connection '+telemetry.connectionState}><Cable size={15}/>{telemetry.connectionState==='online'?'Veza aktivna':'Veza prekinuta'}</span>;
}
function ProgramProgress({ telemetry }: { telemetry: MachineTelemetry }) {
  const progress = telemetry.programProgressPercent;
  return <div className="machine-program-progress">
    <div><span>Napredak programa</span><strong>{progress===null?'—':progress+' %'}</strong></div>
    {progress===null?<div className="machine-progress-empty"/>:<progress aria-label="Napredak programa" value={progress} max={100}/>}
  </div>;
}
const measured = (seconds: number|null|undefined) => seconds==null?'—':duration(seconds);
const dims = (sheet?: Sheet) => sheet ? num(sheet.width) + ' × ' + num(sheet.height) + ' mm' : '—';
function NestThumb({ sheet }: { sheet: Sheet }) {
  return <svg className="machine-nest-thumb" role="img" aria-label="Sačuvani nesting raspored" viewBox={`0 0 ${sheet.width} ${sheet.height}`}>
    <g transform={`translate(0 ${sheet.height}) scale(1 -1)`}>
      {sheet.outline&&<path d={pathData([sheet.outline])} fill="#dbe6ef"/>}
      {sheet.placements.map(part=><path key={part.id} d={pathData(part.rings)} transform={`translate(${part.x} ${part.y})`} fillRule="evenodd"/>)}
    </g>
  </svg>;
}
export function LiveMachine({ telemetry, session, detail = false }: {
  telemetry: MachineTelemetry; session: SimulatorState; detail?: boolean;
}) {
  const {state,run:perform}=useWorkshop();
  const config = machines.find(machine=>machine.id===telemetry.machineId)!;
  const lane = session.lanes.find(item=>item.id===config.id)!;
  const job = state.jobs.find(item=>item.id===telemetry.jobId);
  const program = telemetry.programName ? lane.run ?? lane.lastRun : null;
  const customer = state.customers.find(item=>item.id===job?.customerId);
  const sheets = job?.nest?.sheets ?? [];
  const cycles = session.runs.filter(item=>item.machineId===config.id && item.outcome==='completed');
  const sheetIndex = program ? cycles.filter(item=>item.jobId===program.jobId && item.start<program.start).length : 0;
  const sheet = sheets[sheetIndex] ?? sheets[0];
  const confirmed = session.confirmations.find(item=>item.runId===program?.id);
  const jobLink = job ? '/proizvodnja/'+job.id : '';
  const jobName = job ? job.id+' · '+job.name : '—';
  const order = jobLink ? <Link className="text-link" to={jobLink}>{jobName}</Link> : jobName;
  const actual = measured(telemetry.elapsedSeconds);
  const remaining = measured(telemetry.estimatedRemainingSeconds);
  const machineStatus = <MachineStatus telemetry={telemetry}/>;
  if (!detail) return <Card className="machine-live-card">
    <header className="machine-live-header"><span className="metric-icon blue"><Cpu/></span><div><h2>{config.name}</h2>
      <p>{config.controller} · {config.software}</p></div>{machineStatus}</header>
    <div className="machine-live-strip"><span>{config.type}</span><Connection telemetry={telemetry}/></div>
    <div className="machine-program"><small>Trenutni CNC program</small><code>{telemetry.programName??'—'}</code></div>
    <ProgramProgress telemetry={telemetry}/>
    <Details rows={[
      ['Radni nalog',order],['Kupac',customer?.name],['Materijal',job?.material],['Debljina',job?num(job.thickness)+' mm':null],
      ['Tabla',dims(sheet)],['Početak',program?timeLabel(program.start):null],['Proteklo vreme programa',actual],['Preostalo vreme',remaining],
      ['Završeni ciklusi u smeni',cycles.length],
    ]}/>
    <div className="machine-actions">
      <Link className="button primary" to={'/machines/'+config.id}>Detalji mašine <ArrowRight size={15}/></Link>
      <Link className="button" to={'/machines/'+config.id+'#istorija'}>Istorija</Link>
      {jobLink&&<Link className="button" to={jobLink}>Otvori radni nalog</Link>}
    </div>
  </Card>;

  const stats = sheetStats(sheets);
  const nestTime = job && sheets.length ? cutHours(stats.length,stats.pierces,state.settings)*3600 : null;
  return <div className="machine-detail-grid">
    <Card className="machine-live-card machine-detail-hero">
      <div className="machine-live-strip"><span className="badge blue">{config.type}</span><Connection telemetry={telemetry}/>{machineStatus}</div>
      <div className="machine-program"><small>Trenutni CNC program</small><code>{telemetry.programName??'—'}</code></div>
      <ProgramProgress telemetry={telemetry}/>
      <div className="machine-times">
        <div><small>Proteklo vreme programa</small><strong>{actual}</strong></div>
        <div><small>Planirano trajanje programa</small><strong>{measured(program?.plannedSeconds)}</strong></div>
        <div><small>Procenjeno preostalo vreme</small><strong>{remaining}</strong></div>
      </div>
      <Details rows={[
        ['Kontroler',config.controller],['Softver',config.software],['Početak programa',program?timeLabel(program.start):null],
        ['Vreme od početka',program?duration(((lane.run?session.now:program.end)-program.start)/1000):null],['Završeni ciklusi u smeni',cycles.length],
      ]}/>
      <small className="muted">Procena preostalog vremena koristi planirano vreme izvršavanja programa i isključuje pauze i zastoje.</small>
    </Card>
    <Card title="Aktivni radni nalog" icon={ClipboardList} className="machine-order">
      {job ? <>
        <Details rows={[
          ['Radni nalog',order],['Kupac',customer?.name],['Proizvod',job.name],['Materijal',job.material],
          ['Debljina',num(job.thickness)+' mm'],['Planirani delovi',partCount(job)],['Broj tabli',sheets.length||null],
          ['Dimenzije table',dims(sheet)],['Iskorišćenost lima',sheets.length?num(stats.yield,1)+' %':null],
          ['Planirano sečenje iz nestinga',measured(nestTime)],['Izmereno izvršavanje',actual],
          ['Stvarno rezanje programa',measured(program?.cutSeconds)],
          ['Završeni programi naloga',cycles.filter(item=>item.jobId===job.id).length],
        ]}/>
        {sheet&&<NestThumb sheet={sheet}/>}
        <div className="machine-actions">
          <TextLink to={jobLink}>Otvori radni nalog</TextLink>
          <TextLink to={'/poslovi/'+job.id}>Posao i DXF delovi</TextLink>
          {sheet&&<TextLink to={'/nesting/'+job.id}>Nesting raspored</TextLink>}
          <TextLink to={'/kalkulacije/'+job.id}>Kalkulacija</TextLink>
        </div>
      </>:<p className="muted">Nema dostupnog radnog naloga.</p>}
      {telemetry.operatingState==='completed' && program && <div className="machine-confirm">
        {confirmed ? <span className="badge green">Potvrdio {confirmed.by}</span> :
          <Button icon={Check} onClick={()=>void perform(()=>telemetryService.confirm(program.id,state.settings.user),'Ciklus je potvrđen. Status radnog naloga se uređuje u Proizvodnji.')}>Potvrdi ciklus</Button>}
      </div>}
    </Card>
  </div>;
}
const partCount = (job: Job) => job.parts.filter(part=>!part.excluded).reduce((sum,part)=>sum+part.quantity,0);

export function SimulationControls({ session, id }: { session: SimulatorState; id?: MachineId }) {
  const {run,state}=useWorkshop();
  const [machine,setMachine] = useState<MachineId>(id??machines[0].id);
  const [reset,setReset] = useState(false);
  const lane = session.lanes.find(item=>item.id===machine)!;
  const send = (action: SimulatorAction) => void run(()=>telemetryService.command(action,machine));
  const canStart = !session.enabled && !session.lanes.some(item=>item.run || item.lastRun);
  return <Card title="Kontrole simulacije" icon={Gauge} className="machine-controls"
    action={<span className={'badge '+(session.enabled?'blue':'')}>{session.enabled?'Aktivna':'Pauzirana'} · {timeLabel(session.now)} · {session.speed}×</span>}>
    <div className="machine-control-row">
      <div className="machine-actions">
        <Button variant="primary" icon={Play} disabled={!canStart} onClick={()=>send('start')}>Pokreni simulaciju</Button>
        <Button icon={Pause} disabled={!session.enabled} onClick={()=>send('pause')}>Pauziraj simulaciju</Button>
        <Button icon={Play} disabled={session.enabled||canStart} onClick={()=>send('resume')}>Nastavi simulaciju</Button>
        <div className="toggle-segment" role="group" aria-label="Brzina simulacije">
          <button type="button" aria-pressed={session.speed===1} className={session.speed===1?'active':''} onClick={()=>send('normal')}>1×</button>
          <button type="button" aria-label="Ubrzaj vreme 5×" aria-pressed={session.speed===5} className={session.speed===5?'active':''} onClick={()=>send('fast')}>5×</button>
          <button type="button" aria-label="Ubrzaj vreme 20×" aria-pressed={session.speed===20} className={session.speed===20?'active':''} onClick={()=>send('turbo')}>20×</button>
        </div>
      </div>
      <div className="machine-actions">
        {!id&&<Field label="Mašina za simulaciju događaja"><select value={machine} onChange={event=>setMachine(event.target.value as MachineId)}>
          {machines.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select></Field>}
        {lane.event.state==='alarm'?<Button icon={Check} onClick={()=>send('clear')}>Otkloni alarm</Button>:
          <Button icon={TriangleAlert} disabled={lane.event.state==='offline'} onClick={()=>send('alarm')}>Simuliraj alarm</Button>}
        {lane.event.state==='offline'?<Button icon={Cable} onClick={()=>send('reconnect')}>Ponovo poveži</Button>:
          <Button icon={Cable} onClick={()=>send('disconnect')}>Simuliraj prekid veze</Button>}
        <Button icon={Zap} disabled={!lane.run || !!lane.override || lane.event.state==='alarm'} onClick={()=>send('finish')}>Završi program</Button>
        <Button icon={RotateCcw} onClick={()=>setReset(true)}>Resetuj simulaciju</Button>
      </div>
    </div>
    <details className="machine-run-history">
      <summary>Poveži radne naloge za narednu simulaciju</summary>
      <div className="machine-range">
        {([0,1] as const).map(index=><Field key={index} label={index===0?'Prvi program':'Drugi program'}>
          <select value={session.links[machine][index]??''} onChange={event=>{
            const jobId = event.target.value || null;
            void run(()=>telemetryService.assign(machine,index,jobId),'Veza sa radnim nalogom je sačuvana.');
          }}><option value="">Bez naloga</option>{state.jobs.map(job=><option key={job.id} value={job.id}>{job.id} · {job.name}</option>)}</select>
        </Field>)}
      </div>
    </details>
    {reset&&<Dialog title="Resetuj simulaciju" onClose={()=>setReset(false)}>
      <p>Trenutna simulirana smena kreće ispočetka. Arhiva prethodnih dana ostaje sačuvana.</p>
      <div className="machine-actions"><Button onClick={()=>setReset(false)}>Otkaži</Button><Button variant="primary" onClick={()=>{send('reset');setReset(false);}}>Potvrdi resetovanje</Button></div>
    </Dialog>}
  </Card>;
}

