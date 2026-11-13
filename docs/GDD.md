# Delta-V Tycoon — Game Design Document (short)

Short version of the team brief, Part A §A4–A7 (v1.1, 13 Nov 2026). The full brief (Part A = project bible) is the source of truth; if this file and the brief disagree, the brief wins.

## 1. Concept

**One-liner:** Delta-V Tycoon puts you and up to three friends in charge of a small space agency's mission control. Pick a real-world-style mission, build the spacecraft part by part, pick an orbit and a rocket, argue over a shared budget, sign off together, launch — and watch every decision play out in a simulated mission, with a report that explains exactly why it succeeded or failed.

**Why "Delta-V":** delta-v (change in velocity, m/s) is the fuel budget of space travel. Every orbit costs delta-v, the rocket equation turns delta-v into propellant mass, and propellant mass pushes you toward a bigger, more expensive rocket. That chain is the heart of mission design and is visible on screen.

**Why "Tycoon":** you manage limited money like a business. The budget is split between four roles, roles can request money from each other, and leftover reserve improves your score.

## 2. Core loop (one mission, 10–20 minutes)

| # | Phase | What happens | NASA process · CML |
| --- | --- | --- | --- |
| 1 | Briefing | Choose scenario + difficulty; read the need, goals, user segment and requirements (F-01, F-02) | Identify Need & Goals · CML 1 Cocktail Napkin |
| 2 | Crew | Solo: pick an avatar. Team: create/join a room, claim roles (F-18, F-19) | — |
| 3 | Budget Council | Split the budget between the 4 roles; everyone agrees (F-20) | Define Concept |
| 4 | Design | Each role configures its part; 7 live meters; Trade-Space Explorer (F-03..F-07, F-09, F-34) | Define Requirements & Design · CML 2–3 |
| 5 | Readiness review | GO/NO-GO checks with explanations, Concept Maturity meter, sign-offs (F-08, F-21, F-35) | Build & Verify · CML 4 Point Design |
| 6 | Launch | Animated launch; can fail on real reliability numbers (F-10) | Build & Verify |
| 7 | Operations | Mission plays out day by day at high speed; random events need decisions from the owning role (F-11, F-12) | Implement |
| 8 | Report | Score, stars, outcome, Why, Try next, Mission Twin, who used your data (F-13, F-14, F-33) | Results |
| 9 | Iterate | Retry with the same design, change something, compare scores (F-15) | CML 2–4 loop |

## 3. Game modes

| Mode | Description | Priority |
| --- | --- | --- |
| Solo mission | One player owns all 4 roles | P0 |
| Online team room | 1–4 players on their own devices; room code + link, roles, council, sign-offs | P0-online |
| Same-screen team | Same team mechanics on one device (fallback if online fails) | P0 |
| Challenge code | Same scenario + difficulty + seed for every team → fair competition | P1 |
| Sandbox | No budget limit, all components unlocked, events optional | P1 |
| Agency career ("Tycoon") | Play scenarios in order; reputation raises the next budget | P2 |

## 4. Roles (every mission has all four)

| Role | Segment | Owns (design) | Owns (events) | Role goal (15 pts) |
| --- | --- | --- | --- | --- |
| Mission Commander (`planner`) | Launch | orbit, lifetime, launch vehicle, delta-v margin | budget_cut, debris_conjunction | Total cost ≤ 90% of budget AND launch on time |
| Spacecraft Engineer (`engineer`) | Space | bus, solar array, RTGs, battery, computer, attitude control, propulsion | solar_storm, micrometeoroid, wheel_failure, battery_aging | Launch margin ≥ 10% AND power margin ≥ 15% AND battery covers eclipse |
| Science Lead (`science`) | Space | instruments | discovery, dust_storm | Science returned ≥ 100% of target |
| Comms & Data Officer (`comms`) | Ground | radio, high-gain antenna, ground network | ground_outage, computer_reset | ≥ 95% of generated data returned |

The user segment (people who use the data) is named on each scenario and in the report. The goals pull against each other on purpose: Science wants more instruments, Engineer wants margins, Comms wants downlink headroom, Commander wants money left over — that is the negotiation.

**Budget Council:** default split planner 35 / engineer 30 / science 25 / comms 10. Sliders always sum to 100; every connected player presses Agree; any slider change clears all agrees. Going over allocation is allowed but shows a red badge and a warn check. Funds requests move percentage points between roles when accepted.

**Sign-offs:** every role signs in the review panel; any design change clears all four. The host can launch only with four sign-offs; launching with NO-GO items is allowed after a warning, because learning from failure is part of the challenge.

**Event ownership:** each event belongs to one role; others can suggest; in team mode a timer applies the default option when it runs out.

## 5. Scenarios

| id | Name | Default difficulty | Needs | Best orbit | Budget | Who uses the data |
| --- | --- | --- | --- | --- | --- | --- |
| nile_watch | Eyes on the Nile | Cadet | multispectral / optical | SSO | $120M | Farmers, irrigation engineers and water ministries across the Nile Delta |
| storm_watch | Storm Watcher | Engineer | sounder / thermal IR | GEO | $320M | Weather forecasters, civil-protection agencies and airlines |
| ice_hunter | Ice Hunter | Engineer | neutron + (altimeter / thermal IR) | Lunar | $250M | Mission planners choosing safe, water-rich landing sites |
| red_relay | Red Relay | Flight Director | spectrometer + relay | Mars | $300M | Planetary scientists and rover teams |
| first_light | First Light | Flight Director | IR telescope | L2 | $650M | Astronomers studying the first galaxies and exoplanet atmospheres |
| sandbox | Sandbox | Engineer | — | any | $2000M | You |

Difficulties: **Cadet** (×1.2 budget, ×0.5 events, no launch failures, basic parts, hints, 60 s timer) · **Engineer** (×1.0, all parts, real launch risk, 40 s) · **Flight Director** (×0.9, ×1.5 events, 25 s).

## 6. Crew

Eleven characters (data: `src/data/characters.json`, art: `public/assets/characters/`): nine playable — three Mission Commanders (Nour El-Sayed, Lucas Moreau, Diaa El Awdi), two of each other role — plus two guides: Dr. Hassan Nasr (flight director, tutorial) and Priya Nair (ground station operator, comms tips). Portraits react (neutral / happy / worried) to how the mission is going.

## 7. Where the numbers live

All data values are in `src/data/*.json` (copied from brief §A8). Formulas (§A9), readiness checks (§A10), simulation (§A11), scoring (§A12) and online rooms (§A13) are implemented by Programmer A in `src/core/` and `src/net/`.
