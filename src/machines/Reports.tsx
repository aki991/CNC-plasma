import { useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarDays, CheckCircle2, Clock3, Gauge, Layers3, Timer, TrendingUp } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { num } from '../data/business';
import type { Job } from '../data/types';
import { Card, Empty, Field, Metric } from '../ui/common';
import { downtime, downtimePercent, MachineAnalyticsService, utilization } from './analytics';
import { duration, selectRange, shiftDay, shiftMonth, shortDuration, type DateRange, type Period } from './calendar';
import { Details } from './Live';
import type { MachineId } from './types';
import { machines } from './types';

const periods: [Period,string][] = [['today','Danas'],['week','7 dana'],['month','Mesec'],['year','Godina'],['custom','Prilagođeno']];
export const defaultRange = (day: string) => ({from:shiftDay(day,-6),to:day});
export function PeriodControl({ day, period, setPeriod, custom, setCustom }: {
  day:string; period:Period; setPeriod:(period:Period)=>void; custom:DateRange; setCustom:(range:DateRange)=>void;
}) {
  const range = selectRange(period,day,custom);
  const earliest = shiftMonth(day,-12);
  const rangeLabel = (iso: string) => iso.split('-').reverse().join('.') + '.';
  return <Card className="machine-period">
    <div className="machine-period-head"><div><CalendarDays size={19}/><strong>Period statistike</strong></div>
      <span>{rangeLabel(range.from)} – {rangeLabel(range.to)} · Beograd</span></div>
    <div className="toggle-segment machine-period-buttons" role="group" aria-label="Period statistike">
      {periods.map(([key,label])=><button type="button" key={key} className={key===period?'active':''} aria-pressed={key===period} onClick={()=>setPeriod(key)}>{label}</button>)}
    </div>
    {period==='custom'&&<div className="machine-range">
      <Field label="Od datuma"><input type="date" min={earliest} max={custom.to} value={custom.from} onChange={event=>{
        const from = event.target.value;
        if (from>=earliest&&from<=custom.to) setCustom({...custom,from});
      }}/></Field>
      <Field label="Do datuma"><input type="date" min={custom.from} max={day} value={custom.to} onChange={event=>{
        const to = event.target.value;
        if (to>=custom.from&&to<=day) setCustom({...custom,to});
      }}/></Field>
      <div className="machine-actions">
        <button className="button" type="button" onClick={()=>setCustom({from:shiftMonth(day.slice(0,7)+'-01',-1),to:shiftDay(day.slice(0,7)+'-01',-1)})}>Prethodni mesec</button>
        <button className="button" type="button" onClick={()=>setCustom({from:earliest,to:day})}>Poslednjih 12 meseci</button>
      </div>
    </div>}
  </Card>;
}

const colors = { blue:'#126ed3', green:'#17a367', muted:'#879db5', amber:'#e39320', red:'#d04446', purple:'#795bd0' };
const percent = (value:number|null) => value===null?'—':num(value,1)+' %';
const hours = (seconds:number) => seconds/3600;
const formatHours = (value:unknown) => num(Number(value),2)+' h';
const formatPercent = (value:unknown) => percent(value==null?null:Number(value));
const formatCount = (value:unknown) => num(Number(value));
const axis = {fontSize:11,fill:'#536883'};
const margin = {top:10,right:12,bottom:4,left:0};
const grid = <CartesianGrid stroke="#e1e8f1" vertical={false}/>;
const category = <XAxis dataKey="label" tick={axis} minTickGap={13} axisLine={false} tickLine={false}/>;
const yAxis = (unit: string, max?: number) => <YAxis width={unit ? 51 : 39} tick={axis} tickLine={false} axisLine={false} unit={unit} domain={max?[0,max]:undefined} allowDecimals={unit!==''}/>;
const tooltipStyle = {border:'1px solid #d6e0ee',borderRadius:8,fontSize:12};
function ChartBars({ series }: {series: {key:string;label:string;color:string;stack?:string}[]}) {
  return series.map(item=><Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} stackId={item.stack} maxBarSize={42} isAnimationActive={false}/>);
}
const states = [
  {key:'work',label:'Rad',color:colors.blue,stack:'time'}, {key:'idle',label:'Mirovanje',color:colors.muted,stack:'time'},
  {key:'paused',label:'Pauza',color:colors.amber,stack:'time'}, {key:'alarm',label:'Alarm',color:colors.red,stack:'time'},
  {key:'offline',label:'Offline',color:'#667588',stack:'time'}, {key:'blocked',label:'Evidentirani zastoj',color:colors.purple,stack:'time'},
];
const comparisons = [
  {key:'util',label:'Iskorišćenost',unit:' %',color:colors.blue},
  {key:'work',label:'Vreme rada',unit:' h',color:colors.green},
  {key:'down',label:'Vreme zastoja',unit:' h',color:colors.red},
  {key:'jobs',label:'Završeni poslovi',unit:'',color:colors.purple},
] as const;

export function Reports({ service, ids, range, monthly, jobs }: {
  service:MachineAnalyticsService; ids:readonly MachineId[]; range:DateRange; monthly:boolean; jobs:Job[];
}) {
  const {total,buckets,runs} = useMemo(()=>service.report(ids,range,monthly),[service,ids,range.from,range.to,monthly]);
  const [jobFilter,setJobFilter] = useState('');
  const [comparison,setComparison] = useState<(typeof comparisons)[number]>(comparisons[0]);
  const data = buckets.map(({label,totals})=>({
    label, util:utilization(totals), work:hours(totals.work), idle:hours(totals.idle), paused:hours(totals.paused), alarm:hours(totals.alarm),
    offline:hours(totals.offline), blocked:hours(totals.blocked), programs:totals.programs, jobs:totals.jobs,
  }));
  const completedJobs = new Set(runs.flatMap(run=>run.jobId?[run.jobId]:[]));
  const selectedJob = completedJobs.has(jobFilter) ? jobFilter : '';
  const selected = runs.filter(run=>!selectedJob||run.jobId===selectedJob).slice(0,6).reverse();
  const efficiency = selected.map((run,index)=>({
    label:run.jobId??run.orderId??'Ciklus '+(index+1), program:run.program,
    plan:run.plannedSeconds/60, actual:run.workSeconds/60,
  }));
  const means = new Map<string,{seconds:number;count:number}>();
  for (const run of runs) {
    const key = run.program.replace(/(?:_TABLA)?_\d+\.(?:nc|ngc)$/,'');
    const group = means.get(key)??{seconds:0,count:0};
    means.set(key,{seconds:group.seconds+(run.end-run.start)/1000,count:group.count+1});
  }
  const comparisonData = ids.map(id=>{
    const stats = service.summary([id],range);
    return {label:machines.find(machine=>machine.id===id)!.name,util:utilization(stats),work:hours(stats.work),down:hours(downtime(stats)),jobs:stats.jobs};
  });
  return <section aria-label="Statistika CNC mašina" className="machine-report">
    <div className="machine-section-title"><div><h2><BarChart3/> Statistika rada</h2><p>Vreme rada obuhvata pripremu i aktivno rezanje. Iskorišćenost i zastoj mere se u odnosu na planirano vreme smene do prikazanog trenutka.</p></div></div>
    <div className="metrics machine-stats">
      <Metric icon={Activity} label="Ukupno vreme rada" value={shortDuration(total.work)} detail={shortDuration(total.planned)+' planirano'} />
      <Metric icon={Layers3} label="Aktivno rezanje" value={shortDuration(total.cutting)} tone="green"/>
      <Metric icon={Clock3} label="Mirovanje" value={shortDuration(total.idle)}/>
      <Metric icon={Timer} label="Zastoji" value={shortDuration(downtime(total))} tone="red" detail={percent(downtimePercent(total))+' planiranog vremena'}/>
      <Metric icon={Gauge} label="Iskorišćenost" value={percent(utilization(total))} tone="purple"/>
      <Metric icon={CheckCircle2} label="Završeni programi" value={total.programs} detail={total.jobs+' završenih poslova'} tone="green"/>
    </div>
    <div className="machine-chart-grid">
      <Card title="Iskorišćenost mašine" icon={TrendingUp} className="machine-chart">
        <ResponsiveContainer width="100%" height={220} minWidth={0}><AreaChart data={data} margin={margin}>
          {grid}{category}{yAxis(' %',100)}<Tooltip formatter={formatPercent} contentStyle={tooltipStyle}/>
          <Area dataKey="util" name="Iskorišćenost" stroke={colors.blue} fill="#dbeaff" strokeWidth={2.5} dot={{r:3}} isAnimationActive={false}/>
        </AreaChart></ResponsiveContainer>
      </Card>
      <Card title="Rad, mirovanje i zastoji" icon={Clock3} className="machine-chart">
        <ResponsiveContainer width="100%" height={220} minWidth={0}><BarChart data={data} margin={margin}>
          {grid}{category}{yAxis(' h')}<Tooltip formatter={formatHours} contentStyle={tooltipStyle}/><Legend wrapperStyle={{fontSize:11}}/>
          {ChartBars({series:states})}
        </BarChart></ResponsiveContainer>
      </Card>
      <Card title="Proizvodnja" icon={Layers3} className="machine-chart">
        <ResponsiveContainer width="100%" height={220} minWidth={0}><BarChart data={data} margin={margin}>
          {grid}{category}{yAxis('')}<Tooltip formatter={formatCount} contentStyle={tooltipStyle}/><Legend wrapperStyle={{fontSize:11}}/>
          {ChartBars({series:[{key:'programs',label:'Programi',color:colors.blue},{key:'jobs',label:'Poslovi',color:colors.green}]})}
        </BarChart></ResponsiveContainer>
      </Card>
      <Card title="Planirano i stvarno trajanje" icon={Timer} className="machine-chart">
        {completedJobs.size>0&&<Field label="Radni nalog za poređenje"><select value={selectedJob} onChange={event=>setJobFilter(event.target.value)}>
          <option value="">Poslednjih 6 programa</option>{jobs.filter(job=>completedJobs.has(job.id)).map(job=><option key={job.id} value={job.id}>{job.id} · {job.name}</option>)}
        </select></Field>}
        {efficiency.length?<ResponsiveContainer width="100%" height={220} minWidth={0}><BarChart data={efficiency} margin={margin}>
          {grid}{category}{yAxis(' min')}<Tooltip labelFormatter={(label,payload)=>String(label)+' · '+String(payload?.[0]?.payload?.program??'')}
            formatter={value=>num(Number(value),1)+' min'} contentStyle={tooltipStyle}/><Legend wrapperStyle={{fontSize:11}}/>
          {ChartBars({series:[{key:'plan',label:'Planirano',color:colors.muted},{key:'actual',label:'Izvršavanje',color:colors.blue}]})}
        </BarChart></ResponsiveContainer>:<Empty>Nema završenih programa u ovom periodu.</Empty>}
      </Card>
      {ids.length>1&&<Card title="Poređenje mašina" icon={BarChart3} className="machine-chart">
        <Field label="Pokazatelj za poređenje"><select value={comparison.key} onChange={event=>setComparison(comparisons.find(item=>item.key===event.target.value)??comparisons[0])}>
          {comparisons.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
        </select></Field>
        <ResponsiveContainer width="100%" height={220} minWidth={0}><BarChart data={comparisonData} margin={margin}>
          {grid}{category}{yAxis(comparison.unit,comparison.key==='util'?100:undefined)}
          <Tooltip formatter={value=>num(Number(value),1)+comparison.unit} contentStyle={tooltipStyle}/>
          <Bar dataKey={comparison.key} name={comparison.label} fill={comparison.color} maxBarSize={70} isAnimationActive={false}/>
        </BarChart></ResponsiveContainer>
      </Card>}
      <Card title="Prosečno vreme ciklusa" icon={Timer}>
        {total.programs ? <>
          <strong className="machine-cycle-average">{duration(total.cycleSeconds/total.programs)}</strong>
          <p className="muted small">Vreme od početka do završetka, sa prekidima.</p>
          <Details rows={[...means].sort((a,b)=>b[1].count-a[1].count).slice(0,8).map(([label,group])=>[
            label,duration(group.seconds/group.count)+' · '+group.count+' cik.',
          ])}/>
        </>:<Empty>Nema završenih ciklusa.</Empty>}
      </Card>
    </div>
  </section>;
}
