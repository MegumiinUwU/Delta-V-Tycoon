// Display helpers for Programmer B. Core never rounds; only these functions do.
const one = (x: number): string => {
  if (!Number.isFinite(x)) return String(x);
  const r = Math.round(x * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toLocaleString('en-US', { maximumFractionDigits: 1 });
};
/** Number with at most 1 decimal, no unit. */
export const fmtNum = one;
export const fmtKg = (x: number): string => `${one(x)} kg`;
export const fmtW = (x: number): string => `${one(x)} W`;
export const fmtWh = (x: number): string => `${one(x)} Wh`;
/** Money in $M, e.g. 12.5 → "$12.5M". */
export const fmtM = (x: number): string => `${x < 0 ? '-' : ''}$${one(Math.abs(x))}M`;
export const fmtPct = (x: number): string => `${one(x)}%`;
export const fmtGbit = (x: number): string => `${one(x)} Gbit`;
export const fmtGbitDay = (x: number): string => `${one(x)} Gbit/day`;
export const fmtMs = (x: number): string => `${one(x)} m/s`;
export const fmtMonths = (x: number): string => `${one(x)} ${Math.round(x * 10) / 10 === 1 ? 'month' : 'months'}`;
export const fmtYears = (x: number): string => `${one(x)} ${Math.round(x * 10) / 10 === 1 ? 'year' : 'years'}`;
/** Light delay: seconds below 60 s, minutes above ("12.5 min"). */
export const fmtDelay = (sec: number): string => (sec < 60 ? `${one(sec)} s` : `${one(sec / 60)} min`);

const TAG_WORDS: Record<string, string> = {
  optical: 'optical camera', optical_hr: 'high-resolution optical', multispectral: 'multispectral', thermal_ir: 'thermal infrared',
  radar: 'radar', sounder: 'atmospheric sounder', lightning: 'lightning', neutron: 'neutron', altimeter: 'altimeter',
  magnetic: 'magnetometer', spectrometer: 'spectrometer', particles: 'particle detector', relay: 'relay radio',
  telescope_ir: 'infrared telescope',
};
export const tagWord = (t: string): string => TAG_WORDS[t] ?? t.replace(/_/g, ' ');
/** [["altimeter","thermal_ir"]] → "altimeter or thermal infrared"; multiple groups joined with "; and ". */
export const tagGroupsWords = (groups: string[][]): string => groups.map((g) => g.map(tagWord).join(' or ')).join('; and ');

/** Fill {name} placeholders. Numbers get at most 1 decimal; strings are used as-is. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    if (v === undefined) return m;
    return typeof v === 'number' ? one(v) : v;
  });
}
