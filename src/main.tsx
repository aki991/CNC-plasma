import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-ext-400.css';
import '@fontsource/roboto/latin-ext-500.css';
import '@fontsource/roboto/latin-ext-700.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
import './style.css';
import './workflows.css';
import { initialize, read } from './data/db';
import { Shell } from './ui/shell';
import { WorkshopContext } from './ui/context';
import { ActivityPage, Dashboard } from './pages/Dashboard';
import { JobForm, JobList } from './pages/Jobs';
import { Library } from './pages/Library';
import { Nesting } from './pages/Nesting';
import { Calculations, Quotes } from './pages/Calculation';
import { Production, WorkOrder } from './pages/Production';
import { Customers, InventoryPage, SettingsPage } from './pages/Management';
import { Card, Empty, TextLink } from './ui/common';

const Fences = lazy(() => import('./pages/Fences').then(module => ({ default: module.Fences })));
const Machines = lazy(() => import('./pages/Machines').then(module => ({ default: module.Machines })));

type InstallEvent = Event & { prompt:()=>Promise<unknown>;userChoice:Promise<{outcome:string}> };
function App() {
  const [failure,setFailure]=useState('');
  const [toast,setToast]=useState<{ message:string;error:boolean;id:number }>();
  const [install,setInstall]=useState<InstallEvent|null>(null);
  const state=useLiveQuery(read,[]);
  useEffect(()=>{void initialize().catch(error=>setFailure(error instanceof Error?error.message:'Greška pri učitavanju.'));},[]);
  useEffect(()=>{
    const receive=(event:Event)=>{event.preventDefault();setInstall(event as InstallEvent);};
    const installed=()=>setInstall(null);
    window.addEventListener('beforeinstallprompt',receive);window.addEventListener('appinstalled',installed);
    return ()=>{window.removeEventListener('beforeinstallprompt',receive);window.removeEventListener('appinstalled',installed);};
  },[]);
  useEffect(()=>{
    if(!toast)return;
    const timer=setTimeout(()=>setToast(undefined),toast.error?8500:4500);
    return ()=>clearTimeout(timer);
  },[toast]);
  if(!state)return <div className="loading"><img src="/icon-192.png" alt=""/><h1>CNC CUT PRO</h1>{failure?<p role="alert">Lokalna baza nije dostupna. {failure}</p>:<p><LoaderCircle/> Učitavanje radionice…</p>}</div>;
  return <WorkshopContext.Provider value={{state,notify:(message,error=false)=>setToast({message,error,id:Date.now()})}}>
    <BrowserRouter><Routes><Route element={<Shell/>}>
      <Route index element={<Dashboard/>}/><Route path="aktivnosti" element={<ActivityPage/>}/>
      <Route path="poslovi" element={<JobList/>}/><Route path="poslovi/novi" element={<JobForm/>}/><Route path="poslovi/:id" element={<JobForm/>}/>
      <Route path="dxf/:id?" element={<Library/>}/><Route path="nesting/:id?" element={<Nesting/>}/>
      <Route path="projektovanje-ograda/:id?" element={<Suspense fallback={<Card><Empty>Učitavanje projekata ograda…</Empty></Card>}><Fences/></Suspense>}/>
      <Route path="kalkulacije/:id?" element={<Calculations/>}/><Route path="ponude/:id?" element={<Quotes/>}/>
      <Route path="proizvodnja" element={<Production/>}/><Route path="proizvodnja/:id" element={<WorkOrder/>}/>
      <Route path="machines/:id?" element={<Suspense fallback={<Card><Empty>Učitavanje CNC mašina…</Empty></Card>}><Machines/></Suspense>}/>
      <Route path="magacin" element={<InventoryPage/>}/><Route path="kupci/:id?" element={<Customers/>}/>
      <Route path="podesavanja" element={<SettingsPage install={install} onInstall={()=>{
        if(install)void install.prompt().then(()=>install.userChoice).then(()=>setInstall(null)).catch(()=>setInstall(null));
      }}/>}/>
      <Route path="*" element={<Card><Empty>Stranica nije pronađena. <TextLink to="/">Kontrolna tabla</TextLink></Empty></Card>}/>
    </Route></Routes></BrowserRouter>
    {toast&&<div className={'toast '+(toast.error?'error':'')} role={toast.error?'alert':'status'} key={toast.id}>
      {toast.error?<AlertCircle size={21}/>:<CheckCircle2 size={21}/>}<span>{toast.message}</span><button onClick={()=>setToast(undefined)} aria-label="Zatvori obaveštenje"><X size={17}/></button>
    </div>}
  </WorkshopContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);

