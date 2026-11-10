import { ArrowUp, Box, CalendarDays, Calculator, Check, ClipboardList, FileType, History, Home, Layers3, Play, TrendingUp, Users, Workflow } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { available, dateAt, dateLabel, num, partArea, reserved, rsd, shortDate, sqm } from '../data/business';
import { sheetStats } from '../geometry/nesting';
import { Badge, Card, Donut, Empty, Heading, Metric, Table, TextLink } from '../ui/common';
import { useWorkshop } from '../ui/context';

const activityIcons = { nest: Check, job: Play, quote: Calculator, dxf: FileType, stock: Box, customer: Users };
function timeAgo(time: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(time).getTime()) / 60000));
  if (mins < 1) return 'Upravo sada';
  if (mins < 60) return 'Pre ' + mins + ' min';
  if (mins < 1440) return 'Pre ' + Math.floor(mins / 60) + ' h ' + mins % 60 + ' min';
  return dateLabel(time);
}
function Activities({ all = false }: { all?: boolean }) {
  const { state } = useWorkshop();
  return <div className="activity-list">{state.activities.slice(0, all ? undefined : 5).map(item => {
    const Icon = activityIcons[item.kind];
    const content = <><span className={'activity-icon ' + item.kind}><Icon size={18}/></span><span><strong>{item.title}</strong><small>{timeAgo(item.time)}</small></span></>;
    return item.link ? <Link className="activity-row" key={item.id} to={item.link}>{content}</Link> : <div className="activity-row" key={item.id}>{content}</div>;
  })}</div>;
}
export function ActivityPage() {
  return <><Heading icon={History} title="Poslednje aktivnosti" subtitle="Evidencija poslova, ponuda i materijala."/><Card><Activities all/></Card></>;
}

export function Dashboard() {
  const { state } = useWorkshop();
  const navigate = useNavigate();
  const today = dateAt();
  const active = state.jobs.filter(job => job.status !== 'Završeno');
  const planned = active.filter(job => job.planDate === today && job.start).sort((a,b) => a.start.localeCompare(b.start));
  const todayArea = planned.reduce((sum, job) => sum + partArea(job), 0);
  const plannedMinutes = planned.reduce((sum, job) => {
    const minutes = (time: string) => { const [h,m] = time.split(':').map(Number); return h * 60 + m; };
    return sum + Math.max(0, minutes(job.end) - minutes(job.start));
  }, 0);
  const quotes = state.quotes.filter(quote => quote.status === 'Otvorena' && quote.expires >= today);
  const grouped = (days: number) => sheetStats(state.jobs.filter(job => job.nest && job.nestingAt && job.nestingAt >= dateAt(1-days)).flatMap(job => job.nest!.sheets));
  const utilization = grouped(7);
  const previous = grouped(30);
  const trend = Array.from({ length: 7 }, (_, i) => {
    const date = dateAt(i - 6);
    const stats = sheetStats(state.jobs.filter(job => job.nest && job.nestingAt && job.nestingAt <= date).flatMap(job => job.nest!.sheets));
    return { date, value: stats.yield };
  });
  const chartMin = Math.max(0, Math.floor(Math.min(...trend.map(point => point.value)) / 10) * 10 - 10);
  const chartMax = Math.min(100, Math.ceil(Math.max(...trend.map(point => point.value)) / 10) * 10 + 10);
  const points = trend.map((point, i) => [39+i*48, 106 - (point.value-chartMin)/Math.max(10,chartMax-chartMin)*93]);
  return <>
    <Heading icon={Home} title="Kontrolna tabla" subtitle="Pregled proizvodnje, poslova, materijala i aktivnosti u radionici."><span className="date-pill"><CalendarDays size={19}/>{dateLabel(today)}</span></Heading>
    <div className="metrics">
      <Metric icon={ClipboardList} label="Aktivni poslovi" value={active.length} detail={<>U radu: {active.filter(j=>j.status !== 'U pripremi').length} <em/> U pripremi: {active.filter(j=>j.status === 'U pripremi').length}</>}/>
      <Metric icon={Workflow} label="Danas za sečenje" value={sqm(todayArea,1)} detail={<>{planned.length} poslova <em/> {Math.floor(plannedMinutes/60)} h {plannedMinutes%60} min</>}/>
      <Metric icon={Layers3} label="Iskorišćenost materijala" value={num(utilization.yield,1)+' %'} tone="green" detail={'Prosek (poslednjih 30 dana): '+num(previous.yield,1)+' %'}/>
      <Metric icon={FileType} label="Otvorene ponude" value={quotes.length} tone="purple" detail={rsd(quotes.reduce((sum,q)=>sum+q.total,0))}/>
    </div>
    <div className="dash-middle">
      <Card title="Aktivni poslovi" icon={ClipboardList} action={<TextLink to="/poslovi">Prikaži sve poslove</TextLink>} className="dash-jobs">
        <Table head={['#','Naziv posla','Kupac','Materijal','Rok','Status']}>{active.slice(0,5).map(job=><tr key={job.id} className="click-row" onClick={()=>navigate('/poslovi/'+job.id)}>
          <td>{job.id}</td><td><Link to={'/poslovi/'+job.id}><strong>{job.name}</strong></Link></td><td>{state.customers.find(c=>c.id===job.customerId)?.name}</td>
          <td>{job.material} {job.thickness} mm</td><td>{shortDate(job.due)}</td><td><Badge status={job.status}/></td>
        </tr>)}</Table>
        {!active.length && <Empty>Nema aktivnih poslova.</Empty>}
      </Card>
      <Card title="Današnji plan sečenja" icon={CalendarDays} action={<small>Ukupno: {sqm(todayArea,1)}</small>}>
        <div className="timeline">{planned.map((job,i)=><Link key={job.id} to={'/proizvodnja/'+job.id} className={i===0?'current':''}>
          <span className="timeline-dot">{i===0&&<Check size={12}/>}</span><span>{job.start} – {job.end}</span><strong>{job.name}</strong><span>{sqm(partArea(job),1)}</span>
        </Link>)}</div>
        {!planned.length && <Empty>Nema naloga u današnjem planu.</Empty>}
      </Card>
    </div>
    <div className="dash-bottom">
      <Card title="Stanje materijala" icon={Layers3} action={<TextLink to="/magacin">Detalji magacina</TextLink>}>
        <Table head={['Materijal','Na stanju','Rezervisano','Raspoloživo']}>{state.inventory.filter(i=>!i.remnant).slice(0,3).map(stock=><tr key={stock.id}>
          <td><strong>{stock.material} {stock.thickness} mm</strong><small className="block">({num(stock.height)} × {num(stock.width)} mm)</small></td>
          <td>{stock.quantity} kom</td><td>{reserved(state,stock.id)} kom</td><td className="green-text"><strong>{available(state,stock)} kom</strong></td>
        </tr>)}</Table>
      </Card>
      <Card title="Iskorišćenost materijala" icon={TrendingUp}>
        <div className="yield-summary"><Donut value={utilization.yield}/><div className="yield-details">
          <div><span>Poslednjih 7 dana</span><strong>{num(utilization.yield,1)} %</strong></div>
          <div><span>Prethodnih 30 dana</span><strong>{num(previous.yield,1)} %</strong></div><div><span><ArrowUp size={13}/> Cilj</span><strong>≥ 80 %</strong></div>
        </div></div>
        <svg className="trend" role="img" aria-label="Trend iskorišćenosti za poslednjih sedam dana" viewBox="0 0 345 133">
          <defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#1476ee" stopOpacity=".30"/><stop offset="1" stopColor="#1476ee" stopOpacity=".04"/></linearGradient></defs>
          {[0,1,2,3].map(i=><g key={i}><path d={'M39 '+(13+i*31)+'H328'} stroke="#dfe7ef"/><text x="3" y={17+i*31}>{num(chartMax-i*(chartMax-chartMin)/3)} %</text></g>)}
          <path d={'M39 106 L'+points.map(p=>p.join(' ')).join(' L')+' L327 106 Z'} fill="url(#trend-fill)"/>
          <polyline points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#0b6de4" strokeWidth="2.4"/>
          {points.map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="4" fill="#0b6de4" stroke="white"/><text x={x} y="126" textAnchor="middle">{shortDate(trend[i].date)}</text></g>)}
        </svg>
      </Card>
      <Card title="Poslednje aktivnosti" icon={History} action={<TextLink to="/aktivnosti">Sve aktivnosti</TextLink>}><Activities/></Card>
    </div>
  </>;
}

