import { useEffect } from 'react';
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
  const items: [string, string, boolean?][] = [
    ['Play Solo', '/solo', true],
    ...(online ? [['Create Team Room', '/room/new'], ['Join Room', '/join']] as [string, string][] : [['Team Mode (same screen)', '/solo']] as [string, string][]),
    ['Mission Academy', '/academy'], ['Saved & Compare', '/saved'], ['Leaderboard', '/leaderboard'], ['Settings', '/settings'], ['Credits', '/credits'],
  ];
  return (
    <main className="screen bgcover" style={{ backgroundImage: `url(${bg('bg_title')})`, position: 'relative', overflow: 'hidden' }}>
      <div className="col" style={{ alignItems: 'center', paddingTop: '6vh', gap: 16, flex: 1 }}>
        <img src={ui('logo_deltav')} width={512} height={128} alt="Delta-V Tycoon" style={{ maxWidth: '90vw', height: 'auto' }} />
        <p className="gold" style={{ textAlign: 'center', textShadow: '2px 2px 0 #181425' }}>
          Design, launch and fly a space mission. Every choice has a consequence.
        </p>
        <nav className="col" style={{ width: 320 }} aria-label="Main menu">
          {items.map(([label, path, primary]) => (
            <button key={label} className={`btn big ${primary ? 'gold' : ''}`} onClick={() => navigate(path)}>{label}</button>
          ))}
        </nav>
      </div>
      <div className="row center" style={{ gap: 4, alignItems: 'flex-end', paddingBottom: 8 }} aria-hidden>
        {crew.map((id) => <span key={id} onMouseEnter={() => playVoice(id)}><IdleSprite id={id} scale={2} /></span>)}
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
