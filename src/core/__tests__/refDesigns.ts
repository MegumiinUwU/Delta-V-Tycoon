// Part A §A17 reference designs, as data shared by tests and scripts/balance.ts.
import type { Design, ScenarioId } from '../types';

export interface RefRow {
  name: string; scenarioId: ScenarioId; design: Design;
  totalKg: number; launchMargin: number; loadW: number; genW: number; powerMargin: number; batteryReqWh: number;
  downlink: number; returnPct: number; costM: number; delayM: number;
}

const eng = (busId: string, solarArrayId: string, solarArrayW: number, batteryWh: number, computerId: string, adcsId: string,
  propulsionId: string): Design['engineer'] =>
  ({ busId, solarArrayId, solarArrayW, rtgCount: 0, batteryId: 'bat_liion', batteryWh, computerId, adcsId, propulsionId });

export const A17: RefRow[] = [
  { name: 'nile_watch', scenarioId: 'nile_watch',
    design: { planner: { orbitId: 'sso', lifetimeYears: 3, launchVehicleId: 'spark', deltaVMarginPct: 10 },
      engineer: eng('bus_small', 'sa_si', 450, 350, 'obc_basic', 'adcs_wheels', 'prop_mono'),
      science: { instrumentIds: ['imager_ms', 'imager_tir'] }, comms: { radioId: 'radio_xband', hga: false, groundNetworkId: 'campus' } },
    totalKg: 185.7, launchMargin: 7.1, loadW: 189.8, genW: 248.6, powerMargin: 31.0, batteryReqWh: 277, downlink: 216.0, returnPct: 100, costM: 70.8, delayM: 0 },
  { name: 'storm_watch', scenarioId: 'storm_watch',
    design: { planner: { orbitId: 'geo', lifetimeYears: 5, launchVehicleId: 'workhorse', deltaVMarginPct: 10 },
      engineer: eng('bus_medium', 'sa_si', 700, 1500, 'obc_basic', 'adcs_wheels', 'prop_biprop'),
      science: { instrumentIds: ['sounder_atm', 'imager_tir', 'lightning_map'] }, comms: { radioId: 'radio_xband', hga: false, groundNetworkId: 'commercial' } },
    totalKg: 1005.8, launchMargin: 81.7, loadW: 474.0, genW: 589.0, powerMargin: 24.3, batteryReqWh: 1422, downlink: 1944.0, returnPct: 100, costM: 219.7, delayM: 0 },
  { name: 'ice_hunter', scenarioId: 'ice_hunter',
    design: { planner: { orbitId: 'lunar', lifetimeYears: 1.5, launchVehicleId: 'arrow', deltaVMarginPct: 10 },
      engineer: eng('bus_medium', 'sa_si', 700, 600, 'obc_basic', 'adcs_wheels', 'prop_biprop'),
      science: { instrumentIds: ['spec_neutron', 'lidar_alt', 'imager_tir'] }, comms: { radioId: 'radio_xband', hga: false, groundNetworkId: 'deepspace' } },
    totalKg: 626.4, launchMargin: 10.5, loadW: 299.0, genW: 357.0, powerMargin: 19.4, batteryReqWh: 586, downlink: 259.2, returnPct: 100, costM: 143.8, delayM: 0 },
  { name: 'red_relay', scenarioId: 'red_relay',
    design: { planner: { orbitId: 'mars', lifetimeYears: 2, launchVehicleId: 'workhorse', deltaVMarginPct: 10 },
      engineer: eng('bus_medium', 'sa_gaas', 1800, 600, 'obc_adv', 'adcs_wheels', 'prop_biprop'),
      science: { instrumentIds: ['spec_atm', 'relay_uhf', 'cam_wide'] }, comms: { radioId: 'radio_xband', hga: true, groundNetworkId: 'deepspace' } },
    totalKg: 705.8, launchMargin: 71.8, loadW: 353.2, genW: 427.6, powerMargin: 21.1, batteryReqWh: 589, downlink: 38.9, returnPct: 100, costM: 194.7, delayM: 39 },
  { name: 'first_light', scenarioId: 'first_light',
    design: { planner: { orbitId: 'l2', lifetimeYears: 5, launchVehicleId: 'workhorse', deltaVMarginPct: 10 },
      engineer: eng('bus_medium', 'sa_gaas', 750, 100, 'obc_basic', 'adcs_precision', 'prop_mono'),
      science: { instrumentIds: ['tel_ir'] }, comms: { radioId: 'radio_kaband', hga: false, groundNetworkId: 'deepspace' } },
    totalKg: 755.1, launchMargin: 74.8, loadW: 520.7, genW: 637.5, powerMargin: 22.4, batteryReqWh: 50, downlink: 77.8, returnPct: 100, costM: 487.7, delayM: 3 },
  { name: 'bad example', scenarioId: 'sandbox',
    design: { planner: { orbitId: 'leo', lifetimeYears: 2, launchVehicleId: 'spark', deltaVMarginPct: 10 },
      engineer: eng('bus_cube', 'sa_si', 100, 50, 'obc_basic', 'adcs_mag', 'prop_none'),
      science: { instrumentIds: ['cam_wide'] }, comms: { radioId: 'radio_sband', hga: false, groundNetworkId: 'campus' } },
    totalKg: 21.8, launchMargin: 92.7, loadW: 30.4, genW: 52.7, powerMargin: 73.3, batteryReqWh: 50, downlink: 3.6, returnPct: 18, costM: 18.9, delayM: 0 },
];
