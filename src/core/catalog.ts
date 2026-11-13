import { catalog } from '../data/index';
import type {
  Adcs, Battery, Bus, Catalog, Computer, Design, Difficulty, GameEvent, GroundNetwork, Instrument, LaunchVehicle,
  Orbit, Propulsion, Radio, Scenario, SolarArray, Tier,
} from './types';

export function getCatalog(): Catalog { return catalog; }

function find<T extends { id: string }>(kind: string, list: T[], id: string): T {
  const x = list.find((i) => i.id === id);
  if (!x) throw new Error(`Unknown ${kind} id: ${id}`);
  return x;
}

export const getOrbit = (id: string): Orbit => find('orbit', catalog.orbits, id);
export const getVehicle = (id: string): LaunchVehicle => find('launch vehicle', catalog.launchVehicles, id);
export const getBus = (id: string): Bus => find('bus', catalog.components.buses, id);
export const getArray = (id: string): SolarArray => find('solar array', catalog.components.solarArrays, id);
export const getBattery = (id: string): Battery => find('battery', catalog.components.batteries, id);
export const getComputer = (id: string): Computer => find('computer', catalog.components.computers, id);
export const getAdcs = (id: string): Adcs => find('adcs', catalog.components.adcs, id);
export const getPropulsion = (id: string): Propulsion => find('propulsion', catalog.components.propulsion, id);
export const getRadio = (id: string): Radio => find('radio', catalog.components.radios, id);
export const getGround = (id: string): GroundNetwork => find('ground network', catalog.components.groundNetworks, id);
export const getInstrument = (id: string): Instrument => find('instrument', catalog.instruments, id);
export const getScenario = (id: string): Scenario => find('scenario', catalog.scenarios, id);
export const getDifficulty = (id: string): Difficulty => find('difficulty', catalog.difficulties, id);
export const getEvent = (id: string): GameEvent => find('event', catalog.events, id);

export type ItemKind = 'vehicle' | 'bus' | 'array' | 'rtg' | 'battery' | 'computer' | 'adcs' | 'propulsion' | 'radio'
  | 'hga' | 'instrument';
export interface SelectedItem { kind: ItemKind; id: string; name: string; tier: Tier }

/** Every selected catalog item with its tier (used for advancedCount and isUnlocked). */
export function allSelectableItems(design: Design): SelectedItem[] {
  const e = design.engineer;
  const out: SelectedItem[] = [];
  const add = (kind: ItemKind, x: { id: string; name: string; tier: Tier }) => out.push({ kind, id: x.id, name: x.name, tier: x.tier });
  add('vehicle', getVehicle(design.planner.launchVehicleId));
  add('bus', getBus(e.busId));
  if (e.solarArrayId !== 'none' && e.solarArrayW > 0) add('array', getArray(e.solarArrayId));
  if (e.rtgCount > 0) add('rtg', catalog.components.rtg);
  add('battery', getBattery(e.batteryId));
  add('computer', getComputer(e.computerId));
  add('adcs', getAdcs(e.adcsId));
  add('propulsion', getPropulsion(e.propulsionId));
  add('radio', getRadio(design.comms.radioId));
  if (design.comms.hga) add('hga', catalog.components.hga);
  for (const id of design.science.instrumentIds) add('instrument', getInstrument(id));
  return out;
}

/** Looks up any catalog item by id across every list (null if unknown). */
export function findAnyItem(id: string): { id: string; name: string; tier: Tier } | null {
  const c = catalog.components;
  const lists: { id: string; name: string; tier: Tier }[][] = [
    catalog.launchVehicles, c.buses, c.solarArrays, [c.rtg], c.batteries, c.computers, c.adcs, c.propulsion, c.radios,
    [c.hga], catalog.instruments,
  ];
  for (const l of lists) { const x = l.find((i) => i.id === id); if (x) return x; }
  return null;
}
