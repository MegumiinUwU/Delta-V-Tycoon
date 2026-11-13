// Tiny hash router: refresh never 404s on GitHub Pages.
import { useEffect, useState } from 'react';
import { firebaseConfigured } from './net/firebaseConfig';

export interface Route { path: string; params: Record<string, string>; query: URLSearchParams }

const PATTERNS = ['/', '/solo', '/room/new', '/room/:code', '/join', '/join/:code', '/play', '/academy', '/academy/:id',
  '/saved', '/career', '/design/:code', '/leaderboard', '/settings', '/credits'];

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : '/' + pathPart;
  const segs = path.split('/').filter(Boolean);
  for (const p of PATTERNS) {
    const ps = p.split('/').filter(Boolean);
    if (ps.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    ps.forEach((s, i) => {
      if (s.startsWith(':')) params[s.slice(1)] = decodeURIComponent(segs[i]);
      else if (s !== segs[i]) ok = false;
    });
    if (ok) return { path: p, params, query: new URLSearchParams(queryPart) };
  }
  return { path: '/', params: {}, query: new URLSearchParams(queryPart) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(path: string): void { location.hash = path; }

/**
 * Online cutoff rule (A16): online buttons are hidden with VITE_ONLINE=off or while Firebase is unconfigured;
 * ?online=1 shows them anyway (for testing).
 */
export function onlineEnabled(): boolean {
  const forced = new URLSearchParams(location.search).get('online') === '1' || location.hash.includes('online=1');
  // Cutoff rule (A16): hidden when the build says so, or automatically while Firebase is not configured yet.
  if (import.meta.env.VITE_ONLINE === 'off' || !firebaseConfigured) return forced;
  return true;
}
