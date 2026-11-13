# Sources

Validity is judged on sound science and reliable data. Every source below says what we used it for. **Values in the game are simplified game values inspired by these public sources**, tuned for play.

> Before submitting: open every link in a private window and confirm it works; double-check every Mission Twin year and fact.

## Official challenge resources (cited first)

1. **R. R. Wessen, C. Borden, J. Ziemer, J. Kwok, "Space Mission Concept Development Using Concept Maturity Levels", Jet Propulsion Laboratory, California Institute of Technology, 2013.**
   Used for: the CML 1–4 ladder (Cocktail Napkin → Initial Feasibility → Trade Space → Point Design), the idea that CML 2–4 loop back and forth, "science partials" (how science changes with one parameter), the green/yellow/red checklist with a level reached at ~80% green, and independent assessment. In game: briefing = CML 1, live meters = CML 2, Trade-Space Explorer = CML 3 (F-34), readiness review = CML 4 checklist with Concept Maturity meter (F-35), Dr. Hassan's review board as the independent assessor.
2. **J. Levri, "Design and Develop Science Missions", NASA Small Spacecraft Systems Virtual Institute, Access to Space for All Systems Engineering Webinar Series, 26 March 2025.**
   Used for: a science mission = launch + space + ground + user segments; the process Identify Need & Goals → Define Concept → Define Requirements → Design → Build & Verify → Implement; "begin with the end in mind"; every requirement has a verification method. In game: phase-stepper labels, the four roles mapped to segments, "Who uses your data" on every scenario, requirements panel with a "Verified by" column (F-36).
3. **NASA Webb, "Build It Yourself" game** — https://science.nasa.gov/mission/webb/game-build-it-yourself/
   Used for: science requirements drive the design; infeasible options are greyed out with a reason; a real mission with similar data is revealed after launch; levels grow from small to flagship missions. In game: locked / "cannot reach" options, Mission Twin card (F-33), Cadet → Flight Director difficulty.
4. **NASA, Web-based Space Mission Visualization** — https://nasa.github.io/mission-viz/
   Used for: browser orbit visualization from Keplerian elements with a propagator; Earth–Moon transfer animation. In game: the orbit view draws Kepler ellipses, moves the spacecraft with Kepler's equation (faster near the planet) and animates transfers to far orbits.
5. **NASA Space Apps Challenge 2026 — "Space Mission Design Game" challenge page.** Used for: the objectives and potential considerations our feature list is traced against (brief §A3 traceability matrix).

## Mission Twins (F-33) — verify each fact on the official page

| Twin | Agency | Launched | Our orbit | Official page (to confirm) |
| --- | --- | --- | --- | --- |
| Landsat 9 | NASA / USGS | 2021 | SSO | https://landsat.gsfc.nasa.gov/satellites/landsat-9/ |
| Sentinel-2 | ESA | 2015 | SSO | https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2 |
| GOES-16 | NASA / NOAA | 2016 | GEO | https://www.goes-r.gov/ |
| Meteosat Third Generation Imager-1 | ESA / EUMETSAT | 2022 | GEO | https://www.eumetsat.int/meteosat-third-generation |
| Lunar Prospector | NASA | 1998 | Lunar | https://science.nasa.gov/mission/lunar-prospector/ |
| Lunar Reconnaissance Orbiter | NASA | 2009 | Lunar | https://science.nasa.gov/mission/lro/ |
| Mars Reconnaissance Orbiter | NASA | 2005 | Mars | https://science.nasa.gov/mission/mars-reconnaissance-orbiter/ |
| ExoMars Trace Gas Orbiter | ESA / Roscosmos | 2016 | Mars | https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/ExoMars |
| MAVEN | NASA | 2013 | Mars | https://science.nasa.gov/mission/maven/ |
| James Webb Space Telescope | NASA / ESA / CSA | 2021 | L2 | https://science.nasa.gov/mission/webb/ |
| Herschel Space Observatory | ESA | 2009 | L2 | https://www.esa.int/Science_Exploration/Space_Science/Herschel |

## Engineering references

- **NASA Small Spacecraft Technology State-of-the-Art report (NASA Ames)** — component classes, masses, power and data rates (buses, solar arrays, batteries, ADCS, propulsion, radios).
- **NASA JPL "Basics of Space Flight"** — orbits, Lagrange points, light delay, deep-space communications.
- **NASA Deep Space Network overview** — dish sizes (34–70 m), three-site coverage, scheduled contact hours.
- **ESA Space Debris Office** — debris risk, collision avoidance and end-of-life disposal practice (our `debris_disposal` check and `debris_conjunction` event).
- **Public launch-vehicle user guides (small, medium, heavy classes)** — payload capacity by destination. Our vehicles (Spark, Rideshare, Arrow, Workhorse, Titan) are generic classes, not brands.
- **Tsiolkovsky rocket equation** — propellant = dry mass × (e^(Δv / (Isp × g0)) − 1), used in the mass and delta-v budget (§A9).
- **Mission facts used as anchors** — polar lunar orbiters mapping hydrogen, Mars orbiters relaying rover data and their downlink rates, L2 infrared observatories, geostationary weather imagers with lightning mappers, sun-synchronous Earth-observation satellites.

## Art and fonts

- **ENDESGA 32 palette** by ENDESGA (Lospec palette list) — the only 32 colours used in all pixel art.
- **Press Start 2P** and **VT323** — SIL Open Font License, self-hosted via @fontsource.
- Asset-by-asset credits: see CREDITS.md.
