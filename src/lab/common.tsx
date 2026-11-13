// Shared bits for the Idea Lab screens.
import type { ReactNode } from 'react';
import { navigate } from '../router';
import './lab.css';

/** ENDESGA 32 colours used by the lab drawings. */
export const C = {
  ink: '#181425', navy: '#262b44', slate: '#3a4466', steel: '#5a6988', grey: '#8b9bb4', silver: '#c0cbdc', white: '#ffffff',
  bark: '#3e2731', wood: '#733e39', oak: '#b86f50', pine: '#c28569', sand: '#e4a672', cream: '#ead4aa',
  red: '#e43b44', wine: '#a22633', orange: '#f77622', gold: '#feae34', yellow: '#fee761',
  forest: '#265c42', green: '#3e8948', lime: '#63c74d', deep: '#124e89', blue: '#0099db', cyan: '#2ce8f5',
} as const;

/** Page frame for a lab prototype: title, the community idea it tries (quoted), and the way back. */
export function LabPage({ title, idea, quote, children, back = '/lab' }:
  { title: string; idea?: string; quote?: string; children: ReactNode; back?: string }) {
  return (
    <main className="screen"><div className="page col" style={{ gap: 12 }}>
      <div className="row between wrap">
        <h1 style={{ margin: 0 }}>{title}</h1>
        <span className="row">
          {back !== '/' && <button className="btn" onClick={() => navigate(back)}>◀ Crew cabin</button>}
          <button className="btn" onClick={() => navigate('/')}>Title</button>
        </span>
      </div>
      {idea && <p className="lab-idea small"><span className="gold">Idea tried here: </span>{idea}{quote && <> <q>{quote}</q></>}</p>}
      {children}
    </div></main>
  );
}

/** One frame of a character's 4-frame idle strip, usable inside an SVG scene. */
export function SvgSprite({ href, x, y, frame = 0, scale = 1 }: { href: string; x: number; y: number; frame?: number; scale?: number }) {
  return (
    <svg x={x} y={y} width={32 * scale} height={48 * scale} viewBox={`${frame * 32} 0 32 48`}>
      <image href={href} width={128} height={48} />
    </svg>
  );
}
