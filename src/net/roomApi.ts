// Room API contract (Part A §A14.3). Implementations: localRoom.ts (solo / same-screen)
// and firebaseRoom.ts (online, loaded lazily).
import type { BudgetSplit, Design, DifficultyId, Phase, Role, ScenarioId } from '../core/types';

export interface PlayerState { uid: string; name: string; characterId: string; connected: boolean; joinedAt: number;
  lastSeen: number }
export interface FundsRequest { id: string; fromRole: Role; toRole: Role; amountM: number; reason: string;
  status: 'pending' | 'accepted' | 'declined'; createdAt: number }
export interface ChatMessage { id: string; uid: string; name: string; text: string; at: number }
export interface RoomMeta { code: string | null; hostUid: string; createdAt: number; scenarioId: ScenarioId;
  difficulty: DifficultyId; seed: number; phase: Phase; teamName: string; version: 1; opsSpeed?: 1 | 2 | 4 | 8;
  opsPaused?: boolean }
export interface RoomState {
  meta: RoomMeta; players: Record<string, PlayerState>; roles: Record<Role, string | null>;
  council: { split: BudgetSplit; agreed: Record<string, boolean> }; requests: FundsRequest[];
  design: Design; signoffs: Record<Role, boolean>; reviewDone: boolean;
  decisions: Record<number, { optionId: string; byUid: string; at: number }>;
  suggestions: Record<number, Record<string, string>>; chat: ChatMessage[];
  result: { score: number; stars: number; outcome: string; designCode: string; at: number } | null;
}
export type MetaPatch = Partial<Pick<RoomMeta, 'scenarioId' | 'difficulty' | 'phase' | 'teamName' | 'seed' | 'opsSpeed'
  | 'opsPaused'>>;
export interface RoomApi {
  readonly mode: 'local' | 'online';
  readonly myUid: string;
  subscribe(cb: (s: RoomState) => void): () => void;   // called immediately with current state, then on every change
  getState(): RoomState;
  setMeta(patch: MetaPatch): Promise<void>;            // host only
  updateMe(patch: Partial<Pick<PlayerState, 'name' | 'characterId'>>): Promise<void>;
  claimRole(role: Role): Promise<boolean>;
  releaseRole(role: Role): Promise<void>;
  setSplit(split: BudgetSplit): Promise<void>;           // clears all agreed
  setAgreed(agreed: boolean): Promise<void>;
  requestFunds(fromRole: Role, toRole: Role, amountM: number, reason: string): Promise<void>;
  answerRequest(id: string, accept: boolean): Promise<void>;   // accept moves split points
  updateDesign<R extends Role>(role: R, patch: Partial<Design[R]>): Promise<void>;   // also clears all signoffs
  setSignoff(role: Role, value: boolean): Promise<void>;
  setReviewDone(value: boolean): Promise<void>;
  submitDecision(eventIndex: number, optionId: string): Promise<void>;   // first write wins
  suggest(eventIndex: number, optionId: string): Promise<void>;
  sendChat(text: string): Promise<void>;
  setResult(r: NonNullable<RoomState['result']>): Promise<void>;
  leave(): Promise<void>;
}
export interface RoomOpts { name: string; characterId: string; scenarioId: ScenarioId; difficulty: DifficultyId;
  seed?: number }

export { createLocalRoom } from './localRoom';

/** Online room: Firebase is imported lazily so solo play never loads it. */
export async function createOnlineRoom(opts: RoomOpts): Promise<RoomApi> {
  const m = await import('./firebaseRoom');
  return m.createOnlineRoomImpl(opts);
}
/** Throws Error('ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NETWORK' | 'BAD_CODE'). */
export async function joinOnlineRoom(code: string, opts: { name: string; characterId: string }): Promise<RoomApi> {
  const m = await import('./firebaseRoom');
  return m.joinOnlineRoomImpl(code, opts);
}
export function myRoles(s: RoomState, uid: string): Role[] {
  return (Object.keys(s.roles) as Role[]).filter((r) => s.roles[r] === uid);
}
export function isHost(s: RoomState, uid: string): boolean {
  return s.meta.hostUid === uid;
}
/** Host helper for the lobby button "Fill empty roles with me". */
export async function fillEmptyRoles(room: RoomApi): Promise<void> {
  const s = room.getState();
  for (const r of Object.keys(s.roles) as Role[]) if (!s.roles[r]) await room.claimRole(r);
}
