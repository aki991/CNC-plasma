import { useEffect, useState } from 'react';
import { Cloud, LogOut } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useWorkshop } from '../ui/context';
import { Button, Field, Table } from '../ui/common';
import { readFieldPacket, storeFieldPacket } from './fieldImport';
import type { ProjectPackage } from './fieldContract';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const cloud = url && key ? createClient(url, key) : undefined;

export function FieldCloud({ onImport }: { onImport: (key: string) => void }) {
  const { run, save } = useWorkshop();
  const [session, setSession] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [packets, setPackets] = useState<ProjectPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!cloud) return;
    const { data } = cloud.auth.onAuthStateChange((_event, session) => {
      setSession(!!session);
      if (!session) { setPackets([]); setLoaded(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!cloud) return null;
  const client = cloud;
  const act = (task: () => Promise<void>) => {
    setBusy(true);
    void run(task).finally(() => setBusy(false));
  };
  return <section className="field-inbox-cloud">
    <h3><Cloud size={19}/> Kancelarijski prijem</h3>
    {session ? <>
      <div className="inline-actions"><Button icon={Cloud} disabled={busy} onClick={() => act(async () => {
        const { data, error } = await client.from('field_measurements').select('payload').order('updated_at', { ascending: false }).limit(30);
        if (error) throw error;
        setPackets(data.map(row => readFieldPacket(row.payload)).filter(p => p.status !== 'Planirano' && !p.archived));
        setLoaded(true);
      })}>Preuzmi poslednja merenja</Button>
      <Button icon={LogOut} disabled={busy} onClick={() => act(async () => {
        const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw error;
      })}>Odjavi se</Button></div>
      {loaded && !packets.length && <p>Nema pristiglih merenja.</p>}
      {packets.length > 0 && <Table head={['Kupac', 'Datum', 'Status', '']}>{packets.map(p => <tr key={p.companyId + '/' + p.id}>
        <td>{p.visit.customer.name}</td><td>{p.visit.date}</td><td>{p.status}</td>
        <td><Button disabled={busy} onClick={() => act(async () => {
          let key = '';
          if (await save(data => { key = storeFieldPacket(data, p).key; }, 'Merenje je preuzeto u lokalnu bazu.')) onImport(key);
        })}>Otvori paket</Button></td>
      </tr>)}</Table>}
    </> : <form onSubmit={e => {
      e.preventDefault();
      act(async () => {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword('');
      });
    }}>
      <Field label="Kancelarijski email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)}/></Field>
      <Field label="Lozinka"><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></Field>
      <Button type="submit" disabled={busy}>Prijavi se</Button>
    </form>}
  </section>;
}

