import { useCallback, useEffect, useState } from 'react';
import './App.css';

const API = import.meta.env.VITE_API || 'http://localhost:8000';
const LANES = [
  ['proposed', 'Proposed'],
  ['active', 'Active'],
  ['failed', 'Failed'],
  ['done', 'Verified'],
];
const KINDS = ['quest_created', 'quest_accepted', 'verify_failed', 'quest_done', 'level_up', 'agent_registered'];

const levelOf = (xp) => Math.floor(Math.sqrt(xp / 100));
const pctOf = (xp) => {
  const l = levelOf(xp);
  return Math.round(((xp - 100 * l * l) / (100 * (2 * l + 1))) * 100);
};
const portrait = (role = '') => {
  const r = role.toLowerCase();
  if (r.includes('front')) return '🧙';
  if (r.includes('back')) return '🛡️';
  if (r.includes('ml') || r.includes('ai')) return '🔮';
  if (r.includes('guide') || r.includes('scribe')) return '📜';
  return '🗡️';
};

function describe({ kind, payload: p }) {
  switch (kind) {
    case 'quest_created': return `New quest ${p.id}: ${p.title}`;
    case 'quest_accepted': return `Accepted ${p.id}`;
    case 'verify_failed': return `Verifier failed ${p.id}`;
    case 'quest_done': return `${p.id} verified, +${p.xp_gained} XP to ${p.credited_to || 'hero'}`;
    case 'level_up': return `${p.who && p.who !== 'hero' ? p.who : 'You'} reached level ${p.level}`;
    case 'agent_registered': return `${p.name} joined the party as ${p.role}`;
    default: return kind;
  }
}

function Member({ name, role, xp, status, hero }) {
  const lvl = levelOf(xp);
  return (
    <div className={hero ? 'member hero' : 'member'}>
      <div className='ring' style={{ '--p': pctOf(xp) + '%' }}>
        <span aria-hidden='true'>{hero ? '⚔️' : portrait(role)}</span>
        <b className='lvl' aria-label={`Level ${lvl}`}>{lvl}</b>
      </div>
      <div className='name'>{name}</div>
      <div className='role'>{role}</div>
      <div className='sub'>{xp} of {100 * (lvl + 1) ** 2} XP</div>
      <div className='sub'>{status}</div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [agents, setAgents] = useState([]);
  const [quests, setQuests] = useState([]);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const get = (path) => fetch(API + path).then((r) => r.json());
      const [s, a, q, f] = await Promise.all([
        get('/state'), get('/agents'), get('/quests'), get('/feed?limit=12')
      ]);
      setState(s);
      setAgents(Array.isArray(a) ? a : []);
      setQuests(Array.isArray(q) ? q : []);
      setFeed(Array.isArray(f) ? f : []);
      setError(false);
    } catch (e) {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const es = new EventSource(API + '/events');
    const onEvent = (e) => {
      if (e.type === 'level_up') {
        const p = JSON.parse(e.data);
        setBanner(`${p.who && p.who !== 'hero' ? p.who : 'You'} reached level ${p.level}`);
        setTimeout(() => setBanner(null), 3500);
      }
      refresh();
    };
    KINDS.forEach((k) => es.addEventListener(k, onEvent));
    es.onopen = () => setError(false);
    es.onerror = () => setError(true);
    return () => es.close();
  }, [refresh]);

  const notice = error && (
    <p className='notice'>
      Can&rsquo;t reach game-state at {API}. Start it with <code>.venv/bin/uvicorn main:app --port 8000</code> in the
      game-state folder, then reload this page.
    </p>
  );
  if (!state) return <div className='app'>{notice || <p>Loading the party&hellip;</p>}</div>;

  const busy = (name) => quests.find((q) => q.agent === name && q.status === 'active');

  return (
    <div className='app'>
      {banner && <div className='banner' role='status'>{banner}</div>}
      {notice}

      <section>
        <h2>Your party</h2>
        <div className='party'>
          <Member hero name='You' role='Hero' xp={state.xp} status={`Streak: ${state.streak} day${state.streak === 1 ? '' : 's'}`} />
          {agents.map((a) => {
            const q = busy(a.name);
            return <Member key={a.name} name={a.name} role={a.role} xp={a.xp} status={q ? `On quest ${q.id}` : 'Resting'} />;
          })}
        </div>
        {agents.length === 0 && (
          <p className='sub'>No party members yet. Register one with a POST to /agents and it will appear here.</p>
        )}
      </section>

      <section>
        <h2>Quest board</h2>
        <div className='cols'>
          {LANES.map(([key, label]) => {
            const list = quests.filter((q) => q.status === key);
            return (
              <div className={`lane ${key}`} key={key}>
                <h3>{label}<small>{list.length}</small></h3>
                {list.length === 0 && <p className='sub'>Nothing here yet.</p>}
                {list.map((q) => (
                  <div className='quest' key={q.id}>
                    <b>{q.title}</b>
                    <span>
                      {q.id} for {q.agent || 'you'}, difficulty {q.difficulty}
                      {q.xp_awarded ? `, ${q.xp_awarded} XP` : ''}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2>What just happened</h2>
        <ol className='log'>
          {feed.map((e) => <li key={e.seq}>{describe(e)}</li>)}
        </ol>
      </section>
    </div>
  );
}
