import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, CheckCircle2, Cpu, Gauge, Timer, TriangleAlert } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { num } from '../data/business';
import { Card, Empty, Heading, Metric, TextLink } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { MachineAnalyticsService, utilization } from '../machines/analytics';
import { selectRange, shortDuration, type Period } from '../machines/calendar';
import { HistoryPanel } from '../machines/HistoryPanel';
import { LiveMachine, SimulationControls } from '../machines/Live';
import { defaultRange, PeriodControl, Reports } from '../machines/Reports';
import { historyService, linkedOrderCompletions, readArchive, readSession, telemetryService } from '../machines/service';
import type { DailyRecord } from '../machines/history';
import type { SimulatorState } from '../machines/simulator';
import { machines, type MachineId } from '../machines/types';
import './machines.css';

export function Machines() {
  const { state } = useWorkshop();
  const { id } = useParams();
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const session = useLiveQuery(readSession,[]);
  const archive = useLiveQuery(readArchive,[]);
  const config = machines.find(machine=>machine.id===id);
  useEffect(()=>{
    let mounted = true;
    void telemetryService.start(state.jobs).then(()=>{if(mounted)setReady(true);})
      .catch(()=>{if(mounted)setError('Istorija mašina nije mogla da se učita iz lokalne baze.');});
    return ()=>{mounted=false;};
    // Only initialize on entry; application job edits remain observable through WorkshopContext.
  },[]);
  if (id&&!config) return <Card><Empty>Mašina nije pronađena. <TextLink to="/machines">Sve mašine</TextLink></Empty></Card>;
  if (error) return <Card><p role="alert">{error}</p></Card>;
  if (!ready||!session||!archive) return <Card><Empty>Učitavanje stanja i istorije mašina…</Empty></Card>;
  return <MachineDashboard key={session.day} session={session} archive={archive} id={config?.id}/>;
}

const allIds = machines.map(machine=>machine.id);
function MachineDashboard({session,archive,id}: {session:SimulatorState;archive:DailyRecord[];id?:MachineId}) {
  const {state} = useWorkshop();
  const {hash} = useLocation();
  const [period,setPeriod] = useState<Period>('today');
  const [custom,setCustom] = useState(()=>defaultRange(session.day));
  const ids = useMemo(()=>id?[id]:allIds,[id]);
  const range = selectRange(period,session.day,custom);
  const current = useMemo(()=>historyService.currentDay(session,linkedOrderCompletions(session,state.jobs)),[session,state.jobs]);
  const archiveMap = useMemo(()=>new Map(archive.map(day=>[day.day,day])),[archive]);
  const days = useMemo(()=>new Map(archiveMap).set(current.day,current),[archiveMap,current]);
  const service = useMemo(()=>new MachineAnalyticsService(days),[days]);
  const total = useMemo(()=>service.summary(ids,range),[service,ids,range.from,range.to]);
  const telemetry = telemetryService.adapter(session).sample();
  const config = machines.find(machine=>machine.id===id);
  const selected = telemetry.find(item=>item.machineId===id);
  const utilizationValue = utilization(total);
  const active = telemetry.filter(item=>item.connectionState==='online'&&item.operatingState==='running').length;
  const stopped = telemetry.filter(item=>item.connectionState==='offline'||item.operatingState==='alarm'||item.operatingState==='paused').length;
  useEffect(()=>{
    if (hash) requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'}));
  },[hash]);
  return <div className="machine-page">
    <Heading icon={Cpu} title={config?.name??'CNC mašine'} subtitle={config ? config.controller+' · '+config.software : 'Praćenje rada i iskorišćenosti proizvodnih mašina'}>
      <span className="machine-simulation badge blue"><span className="status-dot"/> Simulacija</span>
      {id&&<Link to="/machines" className="button">Sve mašine</Link>}
    </Heading>
    {!id&&<div className="metrics machine-kpis" aria-label="Pokazatelji mašina">
      <Metric icon={Cpu} label="Ukupno mašina" value={telemetry.length} detail="Praćena oprema"/>
      <Metric icon={Activity} label="U radu" value={active} detail="Trenutno stanje" tone="green"/>
      <Metric icon={TriangleAlert} label="U zastoju" value={stopped} detail="Trenutno stanje" tone="red"/>
      <Metric icon={Timer} label="Vreme rezanja" value={shortDuration(total.cutting)} detail="Izabrani period"/>
      <Metric icon={Gauge} label="Iskorišćenost" value={utilizationValue===null?'—':num(utilizationValue,1)+' %'} detail="Izabrani period" tone="purple"/>
      <Metric icon={CheckCircle2} label="Završeni poslovi" value={total.jobs} detail="Izabrani period" tone="green"/>
    </div>}
    {selected ? <LiveMachine telemetry={selected} session={session} detail/> :
      <section className="machine-live-grid" aria-label="Trenutno stanje mašina">
        {telemetry.map(item=><LiveMachine key={item.machineId} telemetry={item} session={session}/>)}
      </section>}
    {telemetry.every(item=>item.source==='simulator')&&<SimulationControls session={session} id={id}/>}
    <PeriodControl day={session.day} period={period} setPeriod={setPeriod} custom={custom} setCustom={setCustom}/>
    <Reports service={service} ids={ids} range={range} monthly={period==='year'} jobs={state.jobs}/>
    <HistoryPanel days={days} current={current} ids={ids} range={range} timeline={!!id}
      activeEvents={session.lanes.map(lane=>lane.event.id)}/>
  </div>;
}
