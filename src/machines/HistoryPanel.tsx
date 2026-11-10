import { useMemo, useState } from 'react';
import { AlarmClock, ArrowRight, History, Pencil, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, Dialog, Empty, Field } from '../ui/common';
import { useWorkshop } from '../ui/context';
import { atLocal, dateInterval, dateTimeLabel, duration, shiftMonth, timeLabel, type DateRange } from './calendar';
import type { DailyRecord } from './history';
import { telemetryService } from './service';
import { Details } from './Live';
import { activityLabels, downtimeOptions, machines, type DowntimeReason, type MachineId, type StatusEvent } from './types';

const stoppage = (event: StatusEvent) => event.state==='alarm' || event.state==='offline' || event.state==='paused';
const editable = (event: StatusEvent) => stoppage(event) || event.state==='idle';
const machineName = (id: MachineId) => machines.find(machine=>machine.id===id)!.name;

export function HistoryPanel({ days, current, ids, range, timeline, activeEvents }: {
  days:ReadonlyMap<string,DailyRecord>; current:DailyRecord; ids:readonly MachineId[]; range:DateRange; timeline:boolean; activeEvents:string[];
}) {
  const {state,run}=useWorkshop();
  const [day,setDay] = useState(current.day);
  const [shiftMode,setShiftMode] = useState<'shift'|'day'>('shift');
  const [selection,setSelection] = useState<{day:string;id:string}>();
  const [limit,setLimit] = useState(8);
  const viewedDay = days.get(day);
  const shift = viewedDay?.shifts.find(item=>item.machineId===ids[0]);
  const window = shiftMode==='shift' && shift ? {...shift,end:viewedDay?.source==='session'?atLocal(day,16):shift.end} : dateInterval({from:day,to:day});
  const events = viewedDay?.events.filter(event=>event.machineId===ids[0]).sort((a,b)=>a.start-b.start)??[];
  const alarms = useMemo(()=>[...days.values()].filter(record=>record.day>=range.from&&record.day<=range.to)
    .flatMap(record=>record.events.filter(event=>ids.includes(event.machineId) && (stoppage(event)||!!event.simulatedReason||!!record.reasons?.[event.id]))
      .map(event=>({event,record}))).sort((a,b)=>b.event.start-a.event.start),[days,range.from,range.to,ids]);
  const selectedDay = selection ? days.get(selection.day) : undefined;
  const selected = selectedDay?.events.find(event=>event.id===selection?.id);
  const selectedReason = selected && selectedDay?.reasons?.[selected.id];
  const select = (event: StatusEvent, date: string) => setSelection({day:date,id:event.id});
  const isActive = (event:StatusEvent,record:DailyRecord) => record.day===current.day && activeEvents.includes(event.id);
  const archiveRunList = timeline ? viewedDay?.runs.filter(item=>item.machineId===ids[0]).slice().reverse()??[] : [];

  return <>
    {timeline&&<Card title="Vremenska linija smene" icon={History} className="machine-timeline" action={<span className="badge blue">Europe/Belgrade</span>}>
      <div id="istorija" className="machine-range">
        <Field label="Dan istorije"><input type="date" min={shiftMonth(current.day,-12)} max={current.day} value={day} onChange={event=>{
          if (event.target.value>=shiftMonth(current.day,-12)&&event.target.value<=current.day) setDay(event.target.value);
        }}/></Field>
        <Field label="Smena"><select value={shiftMode} onChange={event=>setShiftMode(event.target.value as typeof shiftMode)}>
          <option value="shift">Prva smena</option><option value="day">Ceo dan</option>
        </select></Field>
      </div>
      {events.length ? <>
        <div className="machine-track-labels"><span>{timeLabel(window.start)}</span><span>{timeLabel((window.start+window.end)/2)}</span><span>{shiftMode==='day'?'24:00':timeLabel(window.end)}</span></div>
        <div className="machine-track" role="group" aria-label="Vremenska linija statusa">
          {events.map(event=>{
            const left = Math.max(0,(event.start-window.start)/(window.end-window.start)*100);
            const width = (Math.min(event.end,window.end)-Math.max(event.start,window.start))/(window.end-window.start)*100;
            return width>0&&<button key={event.id} type="button" className={'machine-track-segment state-'+event.state}
              style={{left:left+'%',width:width+'%'}} onClick={()=>select(event,day)}
              title={timeLabel(event.start)+' – '+timeLabel(event.end)+' · '+activityLabels[event.state]}
              aria-label={timeLabel(event.start)+' – '+timeLabel(event.end)+' · '+activityLabels[event.state]}>{width>9?activityLabels[event.state]:''}</button>;
          })}
        </div>
        <div className="machine-key">{Object.entries(activityLabels).map(([key,label])=><span key={key}><i className={'state-'+key}/>{label}</span>)}</div>
        <div className="machine-events" aria-label="Događaji smene">
          {events.map(event=><button key={event.id} type="button" onClick={()=>select(event,day)}>
            <i className={'state-'+event.state}/><span>{timeLabel(event.start)} – {timeLabel(event.end)}</span><strong>{activityLabels[event.state]}</strong><ArrowRight size={13}/>
          </button>)}
        </div>
      </>:<Empty>Nema evidentiranog rada za izabrani dan.</Empty>}
      {!!archiveRunList.length&&<details className="machine-run-history">
        <summary>Programi u smeni · {archiveRunList.length}</summary>
        {archiveRunList.map(item=>{
          const job = state.jobs.find(job=>job.id===item.jobId);
          const confirmation = viewedDay?.confirmations?.find(record=>record.runId===item.id);
          return <div key={item.id} className="machine-run-row"><div><strong>{item.program}</strong><small>{timeLabel(item.start)} – {timeLabel(item.end)} · {duration(item.workSeconds)} rada</small></div>
            {job?<Link to={'/proizvodnja/'+job.id}>{job.id}</Link>:<span>{item.orderId??'—'}</span>}
            {confirmation?<span className="badge green">Potvrdio {confirmation.by}</span>:item.outcome==='completed'&&day===current.day?
              <Button onClick={()=>void run(()=>telemetryService.confirm(item.id,state.settings.user),'Ciklus je potvrđen.')}>Potvrdi ciklus</Button>:
              <span className={'badge '+(item.outcome==='completed'?'green':'amber')}>{item.outcome==='completed'?'Završeno':'Prekinuto'}</span>}
          </div>;
        })}
      </details>}
    </Card>}
    <Card title="Alarmi i zastoji" icon={TriangleAlert} className="machine-alarms" action={<span className="badge amber">{alarms.length} događaja</span>}>
      <div id="alarmi">
      {alarms.length ? <div className="machine-alarm-list">
        {alarms.slice(0,limit).map(({event,record})=>{
          const reason = record.reasons?.[event.id];
          const active = isActive(event,record);
          return <article className="machine-alarm" key={event.id}>
            <span className={'metric-icon '+(event.state==='alarm'?'red':'blue')}><AlarmClock/></span>
            <div><strong>{event.alarm?.description??activityLabels[event.state]}</strong>
              <small>{dateTimeLabel(event.start)} · {machineName(event.machineId)}{event.alarm?.code?' · '+event.alarm.code:''}</small>
              {(reason||event.simulatedReason)&&<small>{reason?.category??event.simulatedReason}{reason?' · '+reason.enteredBy:''}</small>}
            </div>
            <div className="machine-alarm-status"><strong>{duration((event.end-event.start)/1000)}</strong><span className={'badge '+(active?'amber':'green')}>{active?'U toku':'Zatvoren'}</span></div>
            <Button icon={Pencil} onClick={()=>select(event,record.day)}>{reason?'Detalji razloga':'Unesi razlog'}</Button>
          </article>;
        })}
        {alarms.length>limit&&<Button onClick={()=>setLimit(count=>count+8)}>Prikaži još</Button>}
      </div>:<Empty>Nema alarma ili zastoja u izabranom periodu.</Empty>}
      </div>
    </Card>
    {selection&&selected&&selectedDay&&<EventDialog key={selected.id} event={selected} reason={selectedReason}
      active={isActive(selected,selectedDay)} onClose={()=>setSelection(undefined)}
      onSave={async(category,note)=>{
        const reason: DowntimeReason = {category,note,enteredBy:state.settings.user,enteredAt:new Date().toISOString()};
        const saved = await run(()=>telemetryService.note(selected.id,reason,selection.day===current.day?undefined:selection.day),'Razlog zastoja je sačuvan.');
        if (saved) setSelection(undefined);
      }}/>}
  </>;
}

function EventDialog({ event, reason, active, onClose, onSave }: {
  event:StatusEvent; reason?:DowntimeReason; active:boolean; onClose:()=>void;
  onSave:(category:DowntimeReason['category'],note:string)=>Promise<void>;
}) {
  const {state}=useWorkshop();
  const [category,setCategory] = useState<DowntimeReason['category']|''>(reason?.category??'');
  const [note,setNote] = useState(reason?.note??'');
  const [busy,setBusy] = useState(false);
  const job = state.jobs.find(job=>job.id===event.jobId);
  return <Dialog title={activityLabels[event.state]+' · '+machineName(event.machineId)} onClose={onClose}>
    <Details rows={[
      ['Početak',dateTimeLabel(event.start)],['Kraj',active?'U toku':dateTimeLabel(event.end)],['Trajanje',duration((event.end-event.start)/1000)],
      ['CNC program',event.program],['Radni nalog',job?<Link to={'/proizvodnja/'+job.id}>{job.id} · {job.name}</Link>:event.orderId??event.jobId],
      ...(event.alarm?[['Kod alarma',event.alarm.code],['Opis',event.alarm.description]] as [string,string|null][]:[]),
      ...(event.simulatedReason?[['Evidentirani razlog',event.simulatedReason]] as [string,string][]:[]),
      ...(reason?[['Uneo',reason.enteredBy+' · '+dateTimeLabel(Date.parse(reason.enteredAt))]] as [string,string][]:[]),
    ]}/>
    {editable(event)&&<div className="machine-reason">
      <Field label="Razlog zastoja"><select value={category} onChange={event=>setCategory(event.target.value as DowntimeReason['category'])}>
        <option value="">Izaberi razlog</option>{downtimeOptions.map(item=><option key={item}>{item}</option>)}
      </select></Field>
      <Field label="Napomena"><textarea rows={2} maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></Field>
      <div className="machine-actions"><Button onClick={onClose}>Zatvori detalje</Button>
        <Button variant="primary" disabled={!category||busy} onClick={async()=>{if(category){setBusy(true);await onSave(category,note.trim());setBusy(false);}}}>Sačuvaj razlog</Button></div>
    </div>}
  </Dialog>;
}
