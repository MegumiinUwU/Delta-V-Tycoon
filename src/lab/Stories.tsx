// Crew shorts: four-panel comics about the lives of the crew, built from the art the game already has (backgrounds,
// event pictures, portraits with three expressions). They follow the characters' bios in characters.json and stay
// beside the missions: nothing here explains a mission or replaces what a player finds out by flying one.
import { useState } from 'react';
import { bg, eventArt, portrait, scenarioArt, type Expr } from '../assets';
import { getCatalog } from '../core';
import { LabPage } from './common';

type Who = [id: string, expr: Expr];
export interface Panel { art: string; cap?: string; left?: Who; right?: Who; say?: ['left' | 'right', string] }
export interface Strip { id: string; title: string; about: string; panels: Panel[] }

const MC = () => bg('bg_mission_control'), PAD = () => bg('bg_launch_pad'), ROOM = () => bg('bg_clean_room'), SKY = () => bg('bg_title');

export const STRIPS: Strip[] = [
  { id: 'plan_c', title: 'Plan C', about: 'nour', panels: [
    { art: MC(), cap: 'Before rockets, Nour kept forty aircraft apart over Alexandria.', left: ['nour', 'neutral'] },
    { art: MC(), cap: 'One night the radar went dark for ninety seconds.', left: ['nour', 'worried'], say: ['left', 'Plan B. Everyone hold your height.'] },
    { art: MC(), left: ['nour', 'neutral'], say: ['left', 'And if the radios go too, Plan B has a Plan C.'] },
    { art: PAD(), cap: 'Years later, on the pad.', left: ['lucas', 'happy'], right: ['nour', 'happy'], say: ['right', 'Four checklists. One is for the checklists.'] },
  ] },
  { id: 'the_mug', title: 'The mug', about: 'elena', panels: [
    { art: ROOM(), cap: 'Elena’s mug has the rocket equation printed on it.', left: ['elena', 'neutral'] },
    { art: ROOM(), left: ['elena', 'neutral'], right: ['omar', 'happy'], say: ['right', 'Just one more instrument. It is only nine kilograms.'] },
    { art: ROOM(), left: ['elena', 'happy'], right: ['omar', 'neutral'], say: ['left', 'Ask the mug.'] },
    { art: ROOM(), cap: 'The mug always gives the same answer: then something else comes off.', right: ['omar', 'worried'] },
  ] },
  { id: 'a_whisper', title: 'A whisper', about: 'kwame', panels: [
    { art: scenarioArt('red_relay'), cap: 'Day 212. The Mars relay has been silent for six hours.' },
    { art: MC(), left: ['priya', 'worried'], right: ['kwame', 'neutral'], say: ['left', 'The big dish is on it. Nothing but hiss.'] },
    { art: MC(), right: ['kwame', 'neutral'], say: ['right', 'Wait. Under the hiss. Turn the gain down, not up.'] },
    { art: eventArt('ground_outage'), cap: 'Twelve minutes old and fainter than a fridge bulb, but it was there.', left: ['priya', 'happy'], right: ['kwame', 'happy'] },
  ] },
  { id: 'grain_of_rice', title: 'A grain of rice', about: 'hiroshi', panels: [
    { art: SKY(), cap: 'Sapporo. Hiroshi is eleven. His telescope is a drainpipe and a shaving mirror.', left: ['hiroshi', 'neutral'] },
    { art: SKY(), cap: 'It shows him Saturn, the size of a grain of rice.', left: ['hiroshi', 'happy'] },
    { art: scenarioArt('first_light'), cap: 'Thirty years on, his mirror is gold and colder than Pluto.' },
    { art: ROOM(), left: ['hiroshi', 'happy'], right: ['amara', 'worried'], say: ['right', 'Hiroshi. You are crying on the flight hardware.'] },
  ] },
  { id: 'the_drawer', title: 'The drawer', about: 'hassan', panels: [
    { art: MC(), cap: 'Dr. Hassan keeps one drawer of his desk locked.', left: ['hassan', 'neutral'] },
    { art: MC(), left: ['hassan', 'neutral'], right: ['layla', 'neutral'], say: ['right', 'Thirty years here. What is in it?'] },
    { art: eventArt('solar_storm'), cap: 'Every mission he lost. One page each, in his own handwriting.' },
    { art: MC(), left: ['hassan', 'happy'], right: ['layla', 'happy'], say: ['left', 'It is the most useful drawer in the building.'] },
  ] },
];

function PanelView({ p }: { p: Panel }) {
  return (
    <div className="lab-panel" style={{ backgroundImage: `url(${p.art})` }}>
      {p.cap && <div className="cap">{p.cap}</div>}
      {p.say && <div className={`say ${p.say[0]}`}>{p.say[1]}</div>}
      <div className="cast">
        {p.left ? <img src={portrait(...p.left)} width={72} height={72} alt="" /> : <span />}
        {p.right ? <img src={portrait(...p.right)} width={72} height={72} alt="" style={{ transform: 'scaleX(-1)' }} /> : <span />}
      </div>
    </div>
  );
}

/** Plain-text version of a panel for screen readers. */
function describe(p: Panel): string {
  const name = (w?: Who) => (w ? getCatalog().characters.find((c) => c.id === w[0])?.name.split(' ').slice(-2).join(' ') ?? w[0] : '');
  const said = p.say ? `${name(p.say[0] === 'left' ? p.left : p.right)} says: ${p.say[1]}` : '';
  return [p.cap, said].filter(Boolean).join(' ');
}

export function Stories() {
  const [only, setOnly] = useState<string>('all');
  const chars = getCatalog().characters;
  const list = STRIPS.filter((s) => only === 'all' || s.id === only);
  return (
    <LabPage title="Crew shorts" idea="Tell short character stories as small comics, without replacing the player’s own discoveries."
      quote="The basic concept of short stories about the lives of the other Hearthians and Travelers">
      <div className="seg" role="group" aria-label="Choose a strip" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        <button aria-pressed={only === 'all'} onClick={() => setOnly('all')}>All</button>
        {STRIPS.map((s) => <button key={s.id} aria-pressed={only === s.id} onClick={() => setOnly(s.id)}>{s.title}</button>)}
      </div>
      {list.map((s) => {
        const c = chars.find((x) => x.id === s.about)!;
        return (
          <section key={s.id} className="col" aria-label={`${s.title}, a strip about ${c.name}`}>
            <div className="row between wrap"><span className="title" style={{ margin: 0 }}>{s.title}</span><span className="small muted">{c.name} · {c.title}</span></div>
            <div className="lab-strip" aria-hidden>{s.panels.map((p, i) => <PanelView key={i} p={p} />)}</div>
            <ol className="sr-only">{s.panels.map((p, i) => <li key={i}>{describe(p)}</li>)}</ol>
          </section>
        );
      })}
    </LabPage>
  );
}
