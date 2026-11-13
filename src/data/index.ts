// Typed loader + validation for src/data/*.json (owner: Programmer A).
import type { Catalog } from '../core/types';
import orbits from './orbits.json';
import launchVehicles from './launchVehicles.json';
import components from './components.json';
import instruments from './instruments.json';
import scenarios from './scenarios.json';
import difficulties from './difficulties.json';
import events from './events.json';
import glossary from './glossary.json';
import checks from './checks.json';
import dialog from './dialog.json';
import characters from './characters.json';
import constants from './constants.json';

export const catalog: Catalog = {
  orbits, launchVehicles, components, instruments, scenarios, difficulties, events, glossary,
  checksText: checks, dialog, characters, constants,
} as unknown as Catalog;

/** Check ids from A10 — every checks.json key must be one of these. */
export const CHECK_IDS = [
  'launch_destination', 'launch_capacity', 'bus_mass', 'bus_slots', 'power_balance', 'battery_eclipse',
  'deltav_capability', 'electric_power', 'adcs_environment', 'pointing_quality', 'hga_pointing', 'radio_range',
  'data_return', 'storage', 'budget_total', 'role_allocation', 'launch_window', 'required_instruments', 'orbit_fit',
  'lifetime_min', 'debris_disposal', 'natural_lifetime',
] as const;

/** Throws one readable error listing every problem found in the catalog. */
export function validateCatalog(c: Catalog): void {
  const problems: string[] = [];
  const uniq = (kind: string, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.id)) problems.push(`${kind}: duplicate id "${x.id}"`);
      seen.add(x.id);
    }
  };
  uniq('orbits', c.orbits); uniq('launchVehicles', c.launchVehicles); uniq('instruments', c.instruments);
  uniq('scenarios', c.scenarios); uniq('difficulties', c.difficulties); uniq('events', c.events);
  uniq('glossary', c.glossary); uniq('characters', c.characters);
  const k = c.components;
  uniq('buses', k.buses); uniq('solarArrays', k.solarArrays); uniq('batteries', k.batteries);
  uniq('computers', k.computers); uniq('adcs', k.adcs); uniq('propulsion', k.propulsion); uniq('radios', k.radios);
  uniq('groundNetworks', k.groundNetworks);

  const eventIds = new Set(c.events.map((e) => e.id));
  const orbitIds = new Set<string>(c.orbits.map((o) => o.id));
  const allTags = new Set(c.instruments.flatMap((i) => i.tags));

  for (const e of c.events) {
    const opts = new Set(e.options.map((o) => o.id));
    if (!opts.has(e.defaultOptionId)) problems.push(`event ${e.id}: defaultOptionId "${e.defaultOptionId}" is not an option`);
    if (e.defaultOptionIdIfNoPropulsion && !opts.has(e.defaultOptionIdIfNoPropulsion))
      problems.push(`event ${e.id}: defaultOptionIdIfNoPropulsion "${e.defaultOptionIdIfNoPropulsion}" is not an option`);
  }
  for (const o of c.orbits) {
    for (const n of ['campus', 'commercial', 'deepspace'] as const)
      if (typeof o.contactHours?.[n] !== 'number') problems.push(`orbit ${o.id}: missing contactHours.${n}`);
  }
  for (const s of c.scenarios) {
    for (const id of s.eventPool) if (!eventIds.has(id)) problems.push(`scenario ${s.id}: eventPool has unknown event "${id}"`);
    for (const id of Object.keys(s.orbitFit)) if (!orbitIds.has(id)) problems.push(`scenario ${s.id}: orbitFit has unknown orbit "${id}"`);
    for (const g of s.requiredTagGroups)
      for (const t of g) if (!allTags.has(t)) problems.push(`scenario ${s.id}: required tag "${t}" is on no instrument`);
  }
  const checkIds = new Set<string>(CHECK_IDS);
  for (const key of Object.keys(c.checksText))
    if (!checkIds.has(key)) problems.push(`checks.json: key "${key}" is not a check id from A10`);

  if (problems.length) throw new Error(`Catalog validation failed (${problems.length}):\n- ${problems.join('\n- ')}`);
}

if (import.meta.env?.DEV) validateCatalog(catalog);
