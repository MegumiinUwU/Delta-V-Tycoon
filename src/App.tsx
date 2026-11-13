import { useEffect, useState } from 'react';
import { bg, portrait, preload, scenarioArt, ui } from './assets';
import { playMusic, unlockAudio } from './audio/sound';
import { getCatalog } from './core';
import { navigate, useRoute } from './router';
import { useGame } from './state/store';
import { ErrorBoundary, GlossaryDrawer, Loading, Toasts } from './ui/components/common';
import { TopBar } from './ui/components/TopBar';
import { Briefing } from './ui/screens/Briefing';
import { Council } from './ui/screens/Council';
import { DesignWorkshop } from './ui/screens/Design';
import { LaunchScreen, OpsScreen } from './ui/screens/LaunchOps';
import { Academy, Credits, Leaderboard, OpenDesign, Saved, SettingsScreen, Tutorial } from './ui/screens/Misc';
import { Report } from './ui/screens/Report';
import { SoloSetup } from './ui/screens/SoloSetup';
import { ChatDrawer, CreateRoom, Join, Lobby } from './ui/screens/Team';
import { Title } from './ui/screens/Title';

/** Renders the current phase for #/play and #/room/:code. */
function PhaseShell({ code }: { code?: string }) {
  const state = useGame((g) => g.state);
  const room = useGame((g) => g.room);
  const briefingDone = useGame((g) => g.briefingDone);
  const flash = useGame((g) => g.flash);
  useEffect(() => {
    if (!flash) return;
    const el = document.querySelector('.card[aria-pressed=true]');
    el?.classList.add('flash');
    return () => el?.classList.remove('flash');
  }, [flash]);
  useEffect(() => { if (state && state.meta.phase !== 'ops') playMusic('music_menu'); }, [state?.meta.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!room || !state) {
    return (
      <main className="screen"><div className="page col">
        <h1>No mission running</h1>
        <p className="muted">{code ? `Rejoin room ${code} from the join screen.` : 'Start a solo mission or join a room.'}</p>
        <div className="row">
          {code && <button className="btn primary" onClick={() => navigate(`/join/${code}`)}>Join {code}</button>}
          <button className="btn" onClick={() => navigate('/solo')}>Solo mission</button>
          <button className="btn" onClick={() => navigate('/')}>Title</button>
        </div>
      </div></main>
    );
  }
  const phase = state.meta.phase;
  let body: JSX.Element;
  if (phase === 'lobby') body = <Lobby />;
  else if (!briefingDone && (phase === 'council' || phase === 'design')) body = <Briefing />;
  else if (phase === 'council') body = <Council />;
  else if (phase === 'design') body = <DesignWorkshop />;
  else if (phase === 'launch') body = <LaunchScreen />;
  else if (phase === 'ops') body = <OpsScreen />;
  else body = <Report />;
  return (
    <main className="screen">
      <TopBar />
      {body}
      <Tutorial />
      <ChatDrawer />
    </main>
  );
}

export function App() {
  const route = useRoute();
  const settings = useGame((g) => g.settings);
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.documentElement.style.setProperty('--scale', String(settings.textScale));
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  }, [settings.textScale, settings.reducedMotion]);
  useEffect(() => {
    const c = getCatalog();
    const urls = [bg('bg_title'), ui('logo_deltav'), ...c.characters.map((x) => portrait(x.id)), ...c.scenarios.map((s) => scenarioArt(s.id))];
    preload(urls, setLoaded, 5000).then(() => setReady(true));
    const unlock = () => { unlockAudio(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    // Online presence → "Reconnecting…" banner after 3 s offline
    let t: number | undefined;
    const off = () => { t = window.setTimeout(() => useGame.getState().set({ connected: false }), 3000); };
    const on = () => { clearTimeout(t); useGame.getState().set({ connected: true }); };
    addEventListener('offline', off); addEventListener('online', on);
    return () => { removeEventListener('offline', off); removeEventListener('online', on); };
  }, []);
  if (!ready) return <Loading progress={loaded} />;
  let screen: JSX.Element;
  switch (route.path) {
    case '/solo': screen = <SoloSetup />; break;
    case '/room/new': screen = <CreateRoom />; break;
    case '/room/:code': screen = <PhaseShell code={route.params.code} />; break;
    case '/join': screen = <Join />; break;
    case '/join/:code': screen = <Join code={route.params.code} />; break;
    case '/play': screen = <PhaseShell />; break;
    case '/academy': screen = <Academy />; break;
    case '/academy/:id': screen = <Academy focus={route.params.id} />; break;
    case '/saved': screen = <Saved />; break;
    case '/design/:code': screen = <OpenDesign code={route.params.code} />; break;
    case '/leaderboard': screen = <Leaderboard />; break;
    case '/settings': screen = <SettingsScreen />; break;
    case '/credits': screen = <Credits />; break;
    default: screen = <Title />;
  }
  return (
    <ErrorBoundary>
      {screen}
      <GlossaryDrawer />
      <Toasts />
    </ErrorBoundary>
  );
}
