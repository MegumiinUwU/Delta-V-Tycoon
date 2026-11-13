// In-memory stand-in for the Firebase Realtime Database SDK, for firebaseRoom tests (no network, no emulator).
// It also enforces database.rules.json, evaluating each rule expression as written, so a client write the rules
// would refuse fails here too. It is an approximation of Firebase's rule engine, not the real one: the published
// rules still need one check in the Firebase console (Rules Playground) before a live event.
import { readFileSync } from 'node:fs';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Ref { path: string; key: string | null }
interface Snap { val(): Json; exists(): boolean; key: string | null }

const RULES: Json = JSON.parse(readFileSync(new URL('../../../database.rules.json', import.meta.url), 'utf8')).rules;

/** Who the next SDK call is made by (stands in for the signed-in user of that browser). */
export const session = { uid: 'u1' };

let root: Json = {};
let counter = 0;
const listeners = new Set<{ path: string; cb: (s: Snap) => void }>();
let onDisconnects: { uid: string; path: string; value: Json }[] = [];

export function reset(): void {
  root = { '.info': { connected: true, serverTimeOffset: 0 } };
  counter = 0;
  listeners.clear();
  onDisconnects = [];
  session.uid = 'u1';
}

const seg = (p: string): string[] => p.split('/').filter(Boolean);
const overlaps = (a: string, b: string): boolean => { const y = seg(b); return seg(a).every((k, i) => i >= y.length || y[i] === k); };

function at(tree: Json, path: string): Json {
  let n = tree;
  for (const k of seg(path)) {
    if (n === null || typeof n !== 'object') return null;
    n = n[k] ?? null;
  }
  return n ?? null;
}

/** What the server would store: timestamps resolved, nulls and empty objects/arrays dropped. */
function normalize(v: Json): Json {
  if (v === undefined) throw new Error('value contains undefined');
  if (v === null || typeof v !== 'object') return v;
  if (v['.sv'] === 'timestamp') return Date.now();
  const out: Json = {};
  for (const [k, x] of Object.entries(v)) { const n = normalize(x); if (n !== null) out[k] = n; }
  return Object.keys(out).length ? out : null;
}

function put(tree: Json, path: string, v: Json): Json {
  const keys = seg(path);
  if (!keys.length) return v;
  const copy: Json = tree && typeof tree === 'object' ? { ...tree } : {};
  const child = put(copy[keys[0]] ?? null, keys.slice(1).join('/'), v);
  if (child === null) delete copy[keys[0]]; else copy[keys[0]] = child;
  return Object.keys(copy).length ? copy : null;
}

/** What a client reads back: like the real database, objects keyed 0..n-1 come back as arrays. */
function outward(v: Json): Json {
  if (v === null || typeof v !== 'object') return v;
  const keys = Object.keys(v);
  if (keys.every((k, i) => k === String(i))) return keys.map((k) => outward(v[k]));
  const out: Json = {};
  for (const k of keys) out[k] = outward(v[k]);
  return out;
}

const snap = (path: string): Snap => {
  const v = outward(at(root, path));
  return { val: () => v, exists: () => v !== null, key: seg(path).pop() ?? null };
};

// ---------------- rules ----------------

function ruleSnap(tree: Json, path: string) {
  const v = at(tree, path);
  return {
    val: () => v, exists: () => v !== null,
    child: (c: string) => ruleSnap(tree, `${path}/${c}`),
    hasChild: (c: string) => at(tree, `${path}/${c}`) !== null,
    isString: () => typeof v === 'string', isNumber: () => typeof v === 'number', isBoolean: () => typeof v === 'boolean',
  };
}

function evalRule(expr: string, vars: Record<string, string>, after: Json, path: string): boolean {
  try {
    const names = Object.keys(vars);
    const fn = new Function('auth', 'data', 'newData', 'root', 'now', ...names, `return (${expr});`);
    return fn({ uid: session.uid }, ruleSnap(root, path), ruleSnap(after, path), ruleSnap(root, ''), Date.now(),
      ...names.map((n) => vars[n])) === true;
  } catch { return false; }   // a rule that errors (e.g. a property of null) denies, as on the server
}

const wildcard = (node: Json): string | undefined => Object.keys(node).find((k) => k.startsWith('$'));

/** The rule nodes from the root down to `path` (stops where the rules tree ends). */
function walk(path: string): { node: Json; vars: Record<string, string>; path: string }[] {
  const out = [{ node: RULES, vars: {} as Record<string, string>, path: '' }];
  let node: Json = RULES, cur = '';
  const vars: Record<string, string> = {};
  for (const k of seg(path)) {
    const wild = wildcard(node);
    if (!k.startsWith('.') && typeof node[k] === 'object') node = node[k];
    else if (wild) { vars[wild] = k; node = node[wild]; }
    else break;
    cur = cur ? `${cur}/${k}` : k;
    out.push({ node, vars: { ...vars }, path: cur });
  }
  return out;
}

function valid(node: Json, vars: Record<string, string>, path: string, after: Json): boolean {
  const v = at(after, path);
  if (v === null) return true;
  if (typeof node['.validate'] === 'string' && !evalRule(node['.validate'], vars, after, path)) return false;
  if (typeof v !== 'object') return true;
  const wild = wildcard(node);
  return Object.keys(v).every((k) => {
    if (typeof node[k] === 'object') return valid(node[k], vars, `${path}/${k}`, after);
    return wild ? valid(node[wild], { ...vars, [wild]: k }, `${path}/${k}`, after) : true;
  });
}

function canRead(path: string): boolean {
  if (path.startsWith('.info')) return true;
  return walk(path).some((l) => typeof l.node['.read'] === 'string' && evalRule(l.node['.read'], l.vars, root, l.path));
}

function canWrite(path: string, after: Json): boolean {
  const levels = walk(path);
  if (!levels.some((l) => typeof l.node['.write'] === 'string' && evalRule(l.node['.write'], l.vars, after, l.path))) return false;
  const leaf = levels[levels.length - 1];
  return leaf.path !== seg(path).join('/') || valid(leaf.node, leaf.vars, leaf.path, after);
}

const denied = (path: string): Error => Object.assign(new Error(`PERMISSION_DENIED: ${path}`), { code: 'PERMISSION_DENIED' });

/** One atomic write of several paths: every path must be allowed, as with a multi-path update(). */
function commit(writes: [string, Json][]): void {
  let after: Json = root;
  for (const [p, v] of writes) after = put(after, p, normalize(v)) ?? {};
  for (const [p] of writes) if (!canWrite(p, after)) throw denied(p);
  root = after;
  for (const l of [...listeners]) if (listeners.has(l) && writes.some(([p]) => overlaps(p, l.path))) l.cb(snap(l.path));
}

// ---------------- the slice of firebase/database that firebaseRoom.ts uses ----------------

export const database = {
  ref: (_db: unknown, path = ''): Ref => ({ path, key: seg(path).pop() ?? null }),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
  async get(r: Ref): Promise<Snap> { if (!canRead(r.path)) throw denied(r.path); return snap(r.path); },
  async set(r: Ref, v: Json): Promise<void> { commit([[r.path, v]]); },
  async update(r: Ref, values: Record<string, Json>): Promise<void> {
    commit(Object.entries(values).map(([k, v]) => [`${r.path}/${k}`, v] as [string, Json]));
  },
  push(r: Ref): Ref { const key = `-N${String(++counter).padStart(6, '0')}`; return { path: `${r.path}/${key}`, key }; },
  /** Calls back straight away (the real SDK does this when the data is already cached): the hardest case for callers. */
  onValue(r: Ref, cb: (s: Snap) => void, onError?: (e: Error) => void): () => void {
    if (!canRead(r.path)) { queueMicrotask(() => onError?.(denied(r.path))); return () => {}; }
    const l = { path: r.path, cb };
    listeners.add(l);
    cb(snap(r.path));
    return () => { listeners.delete(l); };
  },
  async runTransaction(r: Ref, fn: (cur: Json) => Json): Promise<{ committed: boolean; snapshot: Snap }> {
    if (!canRead(r.path)) throw denied(r.path);
    const next = fn(outward(at(root, r.path)));
    if (next === undefined) return { committed: false, snapshot: snap(r.path) };
    commit([[r.path, next]]);
    return { committed: true, snapshot: snap(r.path) };
  },
  onDisconnect: (r: Ref) => ({
    async update(value: Json): Promise<void> { onDisconnects.push({ uid: session.uid, path: r.path, value }); },
    async cancel(): Promise<void> { onDisconnects = onDisconnects.filter((d) => d.path !== r.path); },
  }),
};

/** That user's browser loses its connection: the server runs the onDisconnect writes it registered. */
export function drop(uid: string): void {
  const mine = onDisconnects.filter((d) => d.uid === uid);
  onDisconnects = onDisconnects.filter((d) => d.uid !== uid);
  const actor = session.uid;
  session.uid = uid;
  try {
    for (const d of mine) commit(Object.entries(d.value).map(([k, v]) => [`${d.path}/${k}`, v] as [string, Json]));
  } finally { session.uid = actor; }
}

/** Number of live listeners on a path (leak checks). */
export const listenerCount = (path: string): number => [...listeners].filter((l) => l.path === path).length;
