import { lazy, Suspense, useEffect, useState } from 'react';
import { bg, idleSprite, portrait, preload, scenarioArt, ui } from './assets';
import { playMusic, unlockAudio } from './audio/sound';
import { getCatalog } from './core';
import { navigate, useRoute } from './router';
import { startDiscoveryTracking } from './state/discoveries';
import { useGame } from './state/store';
import { ErrorBoundary, GlossaryDrawer, Loading, Toasts } from './ui/components/common';
import { Title } from './ui/screens/Title';

// Only the title screen ships in the first download. Every other screen is its own small file, fetched in the
// background as soon as the title is showing, so it is already there by the time you click.
const load = {
  briefing: () => import('./ui/screens/Briefing'),
  career: () => import('./ui/screens/Career'),
  council: () => import('./ui/screens/Council'),
  design: () => import('./ui/screens/Design'),
  lab: () => import('./lab/Lab'),
  launchOps: () => import('./ui/screens/LaunchOps'),
  misc: () => import('./ui/screens/Misc'),
  report: () => import('./ui/screens/Report'),
  solo: () => import('./ui/screens/SoloSetup'),
  team: () => import('./ui/screens/Team'),
  topBar: () => import('./ui/components/TopBar'),
};
const Briefing = lazy(() => load.briefing().then((m) => ({ default: m.Briefing })));
const Career = lazy(() => load.career().then((m) => ({ default: m.Career })));
const Council = lazy(() => load.council().then((m) => ({ default: m.Council })));
const DesignWorkshop = lazy(() => load.design().then((m) => ({ default: m.DesignWorkshop })));
const LaunchScreen = lazy(() => load.launchOps().then((m) => ({ default: m.LaunchScreen })));
const OpsScreen = lazy(() => load.launchOps().then((m) => ({ default: m.OpsScreen })));
const Lab = lazy(() => load.lab().then((m) => ({ default: m.Lab })));
const Academy = lazy(() => load.misc().then((m) => ({ default: m.Academy })));
const Credits = lazy(() => load.misc().then((m) => ({ default: m.Credits })));
const Leaderboard = lazy(() => load.misc().then((m) => ({ default: m.Leaderboard })));
const OpenDesign = lazy(() => load.misc().then((m) => ({ default: m.OpenDesign })));
const Saved = lazy(() => load.misc().then((m) => ({ default: m.Saved })));
const SettingsScreen = lazy(() => load.misc().then((m) => ({ default: m.SettingsScreen })));
const Tutorial = lazy(() => load.misc().then((m) => ({ default: m.Tutorial })));
const Report = lazy(() => load.report().then((m) => ({ default: m.Report })));
const SoloSetup = lazy(() => load.solo().then((m) => ({ default: m.SoloSetup })));
const ChatDrawer = lazy(() => load.team().then((m) => ({ default: m.ChatDrawer })));
const CreateRoom = lazy(() => load.team().then((m) => ({ default: m.CreateRoom })));
const Join = lazy(() => load.team().then((m) => ({ default: m.Join })));
const Lobby = lazy(() => load.team().then((m) => ({ default: m.Lobby })));
const TopBar = lazy(() => load.topBar().then((m) => ({ default: m.TopBar })));

const whenIdle = (f: () => void): void => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(f, { timeout: 1500 });
  else setTimeout(f, 300);
};

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
      <Suspense fallback={null}>
        <TopBar />
        {body}
        <Tutorial />
        <ChatDrawer />
      </Suspense>
    </main>
  );
}

export function App() {
  useEffect(() => startDiscoveryTracking(), []);
  const route = useRoute();
  const settings = useGame((g) => g.settings);
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.documentElement.style.setProperty('--scale', String(settings.textScale));
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  }, [settings.textScale, settings.reducedMotion]);
  useEffect(() => {
    // Wait only for what the title screen shows (short cap), then warm up everything else in the background:
    // the other screens' code, crew portraits, mission art and the pressed-button frames (no flicker on first press).
    preload([bg('bg_title'), ui('logo_deltav')], setLoaded, 1500).then(() => {
      setReady(true);
      whenIdle(() => {
        Object.values(load).forEach((f) => { f().catch(() => { /* retried when the screen is opened */ }); });
        const c = getCatalog();
        preload([ui('ui_button_hover'), ui('ui_button_pressed'), ui('ui_button_disabled'),
          ...c.characters.map((x) => portrait(x.id)), ...c.scenarios.map((x) => scenarioArt(x.id)),
          ...c.characters.map((x) => idleSprite(x.id))], undefined, 15000);
      });
    });
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
    case '/career': screen = <Career />; break;
    case '/design/:code': screen = <OpenDesign code={route.params.code} />; break;
    case '/leaderboard': screen = <Leaderboard />; break;
    case '/settings': screen = <SettingsScreen />; break;
    case '/credits': screen = <Credits />; break;
    case '/lab': screen = <Lab />; break;
    case '/lab/:id': screen = <Lab id={route.params.id} />; break;
    default: screen = <Title />;
  }
  return (
    <ErrorBoundary>
      <Suspense fallback={<main className="screen" />}>{screen}</Suspense>
      <GlossaryDrawer />
      <Toasts />
    </ErrorBoundary>
  );
}
