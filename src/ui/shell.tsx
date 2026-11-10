import { useEffect, useRef, useState } from 'react';
import { Bell, Building2, Calculator, ChevronDown, ClipboardList, Cpu, Factory, Fence, FileType, Home, Layers3, Package, Search, Settings, Users, type LucideIcon } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useWorkshop } from './context';

const navigation: [string, string, LucideIcon][] = [
  ['/', 'Kontrolna tabla', Home], ['/poslovi', 'Poslovi', ClipboardList], ['/dxf', 'DXF fajlovi', FileType],
  ['/projektovanje-ograda', 'Projektovanje ograda', Fence],
  ['/nesting', 'Nesting', Layers3], ['/kalkulacije', 'Kalkulacije', Calculator], ['/proizvodnja', 'Proizvodnja', Factory],
  ['/machines', 'CNC mašine', Cpu],
  ['/magacin', 'Magacin', Package], ['/kupci', 'Kupci', Users], ['/podesavanja', 'Podešavanja', Settings],
];
export const searchKey = (value: string) => value.toLocaleLowerCase('sr-Latn').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'dj');
export function Shell() {
  const { state } = useWorkshop();
  const location = useLocation();
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<'search' | 'profile' | 'alerts' | null>(null);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); ref.current?.focus(); }
      if (event.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const term = searchKey(query.trim());
  const results = term ? [
    ...state.jobs.filter(job => searchKey(job.name + ' ' + job.id).includes(term)).map(job => ({ label: job.name, extra: job.id, url: '/poslovi/' + job.id, Icon: ClipboardList })),
    ...state.customers.filter(item => searchKey(item.name + ' ' + item.contact).includes(term)).map(item => ({ label: item.name, extra: 'Kupac', url: '/kupci/' + item.id, Icon: Users })),
    ...state.models.filter(item => searchKey(item.name + ' ' + item.filename + ' ' + item.id).includes(term)).map(item => ({ label: item.name, extra: item.filename, url: '/dxf/' + item.id, Icon: FileType })),
    ...state.jobs.flatMap(job => job.parts.filter(p => searchKey(p.name + ' ' + p.filename).includes(term)).map(p => ({
      label: p.filename, extra: job.id, url: '/poslovi/' + job.id, Icon: FileType,
    }))),
  ].slice(0, 12) : [];
  const initials = state.settings.user.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('');
  const close = () => { setOpen(null); setQuery(''); };
  return <div className="shell" onClick={e => { if (!(e.target as HTMLElement).closest('.popover-anchor')) setOpen(null); }}>
    <aside className="sidebar">
      <Link className="brand" to="/"><img src="/icon-192.png" alt=""/><div><strong>CNC CUT <b>PRO</b></strong><span>CNC sečenje lima i<br/> metalne ograde</span></div></Link>
      <nav aria-label="Glavna navigacija">{navigation.map(([path, label, Icon]) => <NavLink key={path} to={path} end={path === '/'} className={({isActive}) =>
        isActive || (path === '/kalkulacije' && location.pathname.startsWith('/ponude')) ? 'active' : ''}><Icon/>{label}</NavLink>)}</nav>
    </aside>
    <div className="work-area">
      <header className="topbar">
        <form className="global-search popover-anchor" onSubmit={e => { e.preventDefault(); if (results[0]) { navigate(results[0].url); close(); } }}>
          <Search size={19}/><input ref={ref} aria-label="Globalna pretraga" placeholder="Pretraži poslove, kupce, DXF fajlove..." value={query} onFocus={() => setOpen('search')} onChange={e => { setQuery(e.target.value); setOpen('search'); }}/><kbd>Ctrl + K</kbd>
          {open === 'search' && term && <div className="popover search-results">{results.length ? results.map(({label, extra, url, Icon}, i) =>
            <Link key={i} to={url} onClick={close}><Icon size={17}/><span>{label}</span><small>{extra}</small></Link>) : <p>Nema rezultata za „{query}“.</p>}</div>}
        </form>
        <Link className="company" to="/podesavanja"><Building2/><span><strong>{state.settings.company}</strong><small>Proizvodnja ograda i CNC sečenje</small></span><ChevronDown size={15}/></Link>
        <div className="popover-anchor alert-anchor"><button className="notification" aria-label="Obaveštenja" aria-expanded={open === 'alerts'} onClick={() => setOpen(open === 'alerts' ? null : 'alerts')}><Bell/><i/></button>
          {open === 'alerts' && <div className="popover right"><h3>Obaveštenja</h3>{state.activities.slice(0, 5).map(item =>
            <Link key={item.id} to={item.link ?? '/aktivnosti'} onClick={close}>{item.title}</Link>)}<Link to="/aktivnosti" onClick={close}>Sve aktivnosti</Link></div>}
        </div>
        <div className="popover-anchor"><button className="profile" aria-expanded={open === 'profile'} onClick={() => setOpen(open === 'profile' ? null : 'profile')}>
          <span className="avatar">{initials}</span><span><strong>{state.settings.user}</strong><small>Administrator</small></span><ChevronDown size={15}/>
        </button>{open === 'profile' && <div className="popover right"><Link to="/podesavanja" onClick={close}><Settings size={16}/> Podešavanja profila</Link></div>}</div>
      </header>
      <main className="workspace" key={location.pathname}><Outlet/></main>
    </div>
  </div>;
}

