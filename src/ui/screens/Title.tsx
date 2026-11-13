import { useEffect, useState } from 'react';
import { bg, ui } from '../../assets';
import { playMusic, playVoice } from '../../audio/sound';
import { getCatalog } from '../../core';
import { navigate, onlineEnabled } from '../../router';
import { IdleSprite } from '../components/common';

export const VERSION = 'v0.2';

export function Title() {
  useEffect(() => { playMusic('music_menu'); }, []);
  const online = onlineEnabled();
  const crew = getCatalog().characters.map((c) => c.id);
  // the crew line is 68 px per character at 2x; drop to 1x when the window is too narrow, so nobody is cut off
  const fits = () => typeof window === 'undefined' || window.innerWidth >= crew.length * 68 + 24;
  const [big, setBig] = useState(fits);
  useEffect(() => {
    const onResize = () => setBig(fits());
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, [crew.length]);
  const items: [string, string, boolean?][] = [
    ['Play Solo', '/solo', true],
    ['Agency Career', '/career'],
    ...(online ? [['Create Team Room', '/room/new'], ['Join Room', '/join']] as [string, string][] : [['Team Mode (same screen)', '/solo']] as [string, string][]),
    ['Mission Academy', '/academy'], ['Saved & Compare', '/saved'], ['Leaderboard', '/leaderboard'], ['Settings', '/settings'], ['Credits', '/credits'], ['Idea Lab', '/lab'],
  ];
  return (
    <main className="screen bgcover" style={{ backgroundImage: `url(${bg('bg_title')})`, position: 'relative', overflow: 'hidden' }}>
      <div className="col" style={{ alignItems: 'center', paddingTop: '6vh', gap: 16, flex: 1 }}>
        <img src={ui('logo_deltav')} width={512} height={128} alt="Delta-V Tycoon" style={{ maxWidth: '90vw', height: 'auto' }} />
        <p className="gold" style={{ textAlign: 'center', textShadow: '2px 2px 0 #181425' }}>
          Design, launch and fly a space mission. Every choice has a consequence.
        </p>
        <nav className="col" style={{ width: 340, gap: 10 }} aria-label="Main menu">
          {items.slice(0, online ? 4 : 3).map(([label, path, primary]) => (
            <button key={label} className={`btn big ${primary ? 'gold' : ''}`} onClick={() => navigate(path)}>{label}</button>
          ))}
          <div className="row center wrap" style={{ gap: 4 }}>
            {items.slice(online ? 4 : 3).map(([label, path]) => (
              <button key={label} className="btn small" onClick={() => navigate(path)}>{label.replace('Mission ', '').replace(' & Compare', '')}</button>
            ))}
          </div>
        </nav>
      </div>
      <div className="row center" style={{ gap: 4, alignItems: 'flex-end', paddingBottom: 8 }} aria-hidden>
        {crew.map((id) => <span key={id} onMouseEnter={() => playVoice(id)}><IdleSprite id={id} scale={big ? 2 : 1} /></span>)}
      </div>
      <footer className="row between small" style={{ padding: '6px 12px', background: '#181425cc' }}>
        <span>NASA Space Apps Cairo 2026 · Space Mission Design Game challenge</span>
        <span className="row">
          <a href="#/academy" aria-label="Mission Academy">?</a>
          <span className="dim">{VERSION}</span>
        </span>
      </footer>
    </main>
  );
}
