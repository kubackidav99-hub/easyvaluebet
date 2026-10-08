// gRPC-web wire layout verified against TapsHTS/betclic-api (MIT).
// This module reads public offering data only; it never places bets.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
type Field = number | Uint8Array;
type Message = Map<number, Field[]>;
export type Selection = { name: string; odds: number };
export type Market = { id?: number; name: string; suspended: boolean; selections: Selection[] };
export type Event = { id: number; name: string; date: string; competition: string; teams: string[]; markets: Market[]; categories?: {code:string;name:string}[]; errors?: string[] };
function varint(n: number): number[] {
  let v = BigInt(n); const out: number[] = [];
  do { const b = Number(v & BigInt(127)); v >>= BigInt(7); out.push(b | (v ? 128 : 0)); } while (v);
  return out;
}
export function field(n: number, v: number | string): number[] {
  if (typeof v === 'number') return [...varint(n * 8), ...varint(v)];
  const bytes = encoder.encode(v); return [...varint(n * 8 + 2), ...varint(bytes.length), ...bytes];
}
function read(data: Uint8Array, start: number): [number, number] {
  let v = BigInt(0), shift = BigInt(0), p = start;
  for (; p < data.length && shift < BigInt(70); shift += BigInt(7)) { const b = data[p++]; v |= BigInt(b & 127) << shift; if (!(b & 128)) return [Number(v), p]; }
  throw new Error('Niepełna odpowiedź protobuf');
}
function message(data: Uint8Array): Message {
  const result: Message = new Map(); let p = 0;
  while (p < data.length) {
    let tag: number; [tag, p] = read(data, p); const n = Math.floor(tag / 8), wire = tag % 8;
    if (!n) break;
    let v: Field;
    if (wire === 0) [v, p] = read(data, p);
    else { let length = wire === 1 ? 8 : wire === 5 ? 4 : 0;
      if (wire === 2) [length, p] = read(data, p); else if (wire !== 1 && wire !== 5) break;
      if (p + length > data.length) break;
      v = data.slice(p, p + length); p += length;
    }
    result.set(n, [...(result.get(n) || []), v]);
  }
  return result;
}
const bytes = (m: Message, n: number): Uint8Array[] => (m.get(n) || []).filter((v): v is Uint8Array => v instanceof Uint8Array);
function str(v?: Field): string { try { return v instanceof Uint8Array ? decoder.decode(v) : ''; } catch { return ''; } }
function selection(data: Uint8Array): Selection | null {
  const m = message(data), name = [10, 11, 2, 3].map(n => str(m.get(n)?.[0])).find(Boolean);
  if(m.has(14)&&m.get(14)?.[0]!==1)return null;
  const b = bytes(m, 12)[0]; if (!name || !b || b.length !== 8) return null;
  const odds = new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, true);
  return odds > 1 && odds < 10000 ? { name, odds: Math.round(odds * 100) / 100 } : null;
}
function selections(data: Uint8Array, depth = 0): Selection[] {
  if (depth > 4) return []; const m = message(data);
  let out = bytes(m, 16).map(selection).filter((v): v is Selection => !!v);
  if (!out.length) for (const g of bytes(m, 10)) for (const item of bytes(message(g), 1)) {
    const sub = bytes(message(item), 1); out.push(...(sub.length ? sub : [item]).map(selection).filter((v): v is Selection => !!v));
  }
  return out;
}
function marketsFrom(data:Uint8Array, parent='', depth=0):Market[] {
  if(depth>4)return [];const m=message(data);
  const title=str(m.get(3)?.[0])||str(m.get(2)?.[0]);
  const children=bytes(m,13);
  // Field 9 describes the display structure (3 = submarkets), not suspension.
  // Keep each leaf's full label so halves/quarters/sets cannot be flattened together.
  if(children.length)return children.flatMap(raw=>marketsFrom(raw,title,depth+1));
  const sels=selections(data);if(!title||!sels.length)return [];
  const name=parent&&/^\d[.]?\s*(połowa|kwarta|set|tercja)$/i.test(title.trim())?`${parent} · ${title}`:title;
  return [{id:Number(m.get(1)?.[0]||0),name,selections:sels,suspended:false}];
}
function event(data: Uint8Array): Event {
  const m = message(data), competition = bytes(m, 8)[0]; const markets: Market[] = [];
  for (const wrapper of bytes(m, 11)) { const w = message(wrapper);
    for (const raw of [...bytes(w, 3), ...bytes(w, 1)]) markets.push(...marketsFrom(raw));
  }
  return { id: Number(m.get(1)?.[0] || 0), name: str(m.get(2)?.[0]), date: str(m.get(3)?.[0]), competition: competition ? str(message(competition).get(2)?.[0]) : '', teams: bytes(m, 12).map(t => str(message(t).get(3)?.[0])).filter(Boolean), markets, categories:bytes(m,10).map(c=>{const cat=message(c);return {code:str(cat.get(2)?.[0]),name:str(cat.get(3)?.[0])};}).filter(c=>!!c.code) };
}
export function parseEvents(frame: Uint8Array, detail = false): Event[] {
  const root = message(frame), out: Event[] = [];
  for (const wrapper of bytes(root, 1)) for (const raw of bytes(message(wrapper), detail ? 1 : 3)) { const e = event(raw); if (e.id && e.name) out.push(e); }
  return out;
}
export async function offering(method: string, payload: number[], signal?: AbortSignal): Promise<Uint8Array> {
  const body = new Uint8Array(payload.length + 5); new DataView(body.buffer).setUint32(1, payload.length); body.set(payload, 5);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 18000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`https://offering.begmedia.com/web/offering.access.api/offering.access.api.MatchService/${method}`, {
      method: 'POST', body, signal: signal ? AbortSignal.any([signal,controller.signal]) : controller.signal, headers: { 'Content-Type': 'application/grpc-web+proto', 'x-grpc-web': '1', 'x-bg-ref-platform': 'DESKTOP', 'x-bg-regulation': 'PL', 'x-bg-ref-brand': 'BETCLIC', 'x-bg-ref-regulator-zone': 'PL', ...(typeof window==='undefined'?{Origin:'https://www.betclic.pl',Referer:'https://www.betclic.pl/'}:{}) },
    });
    if (!response.ok || !response.body) throw new Error(`Betclic: HTTP ${response.status}`);
    reader = response.body.getReader(); let raw = new Uint8Array(0);
    while (raw.length < 4_000_000) { const chunk = await reader.read(); if (chunk.done) break;
      const joined = new Uint8Array(raw.length + chunk.value.length); joined.set(raw); joined.set(chunk.value, raw.length); raw = joined;
      if (raw.length >= 5) { const size = new DataView(raw.buffer).getUint32(1); if (raw.length >= size + 5) {
        if (raw[0] === 128) throw new Error('Betclic: odpowiedź bez danych');
        return raw.slice(5, 5 + size);
      } }
    }
    throw new Error('Betclic: niepełna odpowiedź');
  } finally { clearTimeout(timer); if (reader) await reader.cancel().catch(() => {}); }
}
export async function getEvents(sport: string, offset: number, signal?:AbortSignal) { return parseEvents(await offering('GetMatchesBySportWithNotifications', [...field(1,sport),...field(2,'pl'),...field(4,offset),...field(5,40)],signal)); }
export async function getEvent(id: number, signal?:AbortSignal, category?:string) { const results = parseEvents(await offering('GetMatchWithNotification', [...field(1,id),...field(2,'pl'),...(category?field(3,category):[])],signal),true); if (!results[0]) throw new Error('Betclic: brak szczegółów wydarzenia'); return results[0]; }
export async function getExpandedEvent(id:number, signal?:AbortSignal) {
  const base=await getEvent(id,signal);const merged=new Map(base.markets.map(m=>[`${m.id}-${m.name}`,m]));const errors:string[]=[];
  // Use category codes actually advertised for this event; never invent sport slugs.
  const advertised=(base.categories||[]).filter(c=>!/(^top$|supersub|strzelc|zawodnik|scorer|player|dokładny wynik)/i.test(c.name));
  const categories=advertised.slice(0,8);if(advertised.length>8)errors.push('Osiągnięto limit kategorii tego meczu.');
  for(const category of categories){
    if(signal?.aborted)throw new DOMException('Zatrzymano','AbortError');
    try{const detail=await getEvent(id,signal,category.code);for(const m of detail.markets)merged.set(`${m.id}-${m.name}`,m);}
    catch(e){if(signal?.aborted)throw e;errors.push(`${category.name}: ${e instanceof Error?e.message:'Błąd odczytu'}`);}
  }
  return {...base,markets:[...merged.values()],errors};
}
