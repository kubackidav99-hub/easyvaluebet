import { getEvents, getExpandedEvent, type Event, type Market } from './protocol';
export type Sport = { key: string; name: string; icon: string; pinnacleId: number | null; active: number };
export type PinEvent = { id: number; startTime: string; isLive: boolean; parentId?: number; special?: {category?:string;description?:string}; units?: string; participants: { id: number; name: string; alignment: string }[]; league: { name: string } };
export type PinMarket = { matchupId: number; type: string; period: number; key: string; cutoffAt: string; status?: string; side?:string; prices: { designation?: string; participantId?: number; price: number; points?: number }[] };
export type Opportunity = { id: string; sport: string; event: string; league: string; start: string; market: string; pick: string; odds: number; reference: number; fair: number; probability: number; ev: number; observedAt: number; referenceAt: number; eventId: number; pinId: number; referenceOdds: number[]; settlement: string; kind?:MarketKind; period?:string };
const catalog: [string,string,string,string][] = [
 ['football','Piłka nożna','⚽','Soccer'],['basketball','Koszykówka','🏀','Basketball'],['tennis','Tenis','🎾','Tennis'],['ice_hockey','Hokej','🏒','Hockey'],['volleyball','Siatkówka','🏐','Volleyball'],['handball','Piłka ręczna','🤾','Handball'],['american_football','Futbol amerykański','🏈','Football'],['baseball','Baseball','⚾','Baseball'],['table_tennis','Tenis stołowy','🏓','Table Tennis'],['martial_arts','MMA','🥊','Mixed Martial Arts'],['boxing','Boks','🥊','Boxing'],['rugby_union','Rugby union','🏉','Rugby Union'],['rugby_league','Rugby league','🏉','Rugby League'],['badminton','Badminton','🏸','Badminton'],['darts','Dart','🎯','Darts'],['cricket','Krykiet','🏏','Cricket'],['australian_rules','Futbol australijski','🏉','Australian Rules'],['snooker','Snooker','🎱','Snooker'],['esports','E-sport','🎮','E Sports'],['golf','Golf','⛳','Golf'],['formula_1','Formuła 1','🏎','Motorsport'],['cycling','Kolarstwo','🚴','Cycling'],['biathlon','Biathlon','🎿','Biathlon'],['speedway','Żużel','🏍','Speedway'],['sailing','Żeglarstwo','⛵','Sailing'],['ski_jumping','Skoki narciarskie','🎿','Ski Jumping'],['alpine_skiing','Narciarstwo alpejskie','⛷','Alpine Skiing'],['nascar','NASCAR','🏁','Motorsport'],['water_polo','Piłka wodna','🤽','Water Polo'],['futsal','Futsal','⚽','Futsal']
];
type Entry = { until: number; promise: Promise<unknown> };
const memory = new Map<string, Entry>();
export async function cached<T>(key: string, loader: () => Promise<T>, seconds = 120): Promise<T> {
  const now = Date.now(), existing = memory.get(key); if (existing && existing.until > now) return existing.promise as Promise<T>;
  const promise = loader().catch(e => { memory.delete(key); throw e; }); memory.set(key,{until:now+seconds*1000,promise});
  if (memory.size > 400) for (const [k,v] of memory) if (v.until < now) memory.delete(k);
  return promise;
}
async function pin<T>(path: string): Promise<T> {
  const r = await fetch(`https://guest.api.arcadia.pinnacle.com/0.1${path}`, { signal: AbortSignal.timeout(18000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Pinnacle: HTTP ${r.status}`); return r.json();
}
export async function sports(): Promise<Sport[]> {
  const list = await cached<{id:number;name:string;matchupCount:number}[]>('pin-sports',() => pin('/sports'),300);
  return catalog.map(([key,name,icon,ref]) => { const found = list.find(x => x.name.toLowerCase()===ref.toLowerCase()); return { key,name,icon,pinnacleId:found?.id??null,active:found?.matchupCount||0 }; });
}
export async function reference(id: number) { return cached(`pin-${id}`,async() => {
  // Reduce the large soccer feed before reading markets to bound Worker memory.
  const events=(await pin<PinEvent[]>(`/sports/${id}/matchups`)).filter(p=>!p.isLive&&(!p.special||/^Both Teams To Score\?(?: [12](?:st|nd) Half)?$/.test(p.special.description||''))).map(p=>({id:p.id,startTime:p.startTime,isLive:p.isLive,parentId:p.parentId,special:p.special,units:p.units,participants:p.participants.map(x=>({id:x.id,name:x.name,alignment:x.alignment})),league:{name:p.league.name}}));
  const ids=new Set(events.map(p=>p.id));
  const markets=(await pin<PinMarket[]>(`/sports/${id}/markets/straight`)).filter(m=>ids.has(m.matchupId)&&m.status==='open').map(m=>({matchupId:m.matchupId,type:m.type,period:m.period,key:m.key,cutoffAt:m.cutoffAt,status:m.status,side:m.side,prices:m.prices.map(x=>({designation:x.designation,participantId:x.participantId,price:x.price,points:x.points}))}));
  return {events,markets,observedAt:Date.now()};
},120); }
const aliases: Record<string,string> = { 'real madryt':'real madrid','bayern monachium':'bayern munich','inter mediolan':'inter milan','ac mediolan':'ac milan','manchester utd':'manchester united','paris saint germain':'psg','borussia mgladbach':'borussia monchengladbach','san martin corrientes':'san martin de corrientes','olympiakos':'olympiacos','olympiakos bc':'olympiacos','olympiacos bc':'olympiacos' };
export function normalize(name: string) { const text = name.toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); return aliases[text] || text; }
export function matchEvent(b: Event, pins: PinEvent[]): PinEvent | undefined {
  if (b.teams.length!==2 || !Number.isFinite(Date.parse(b.date)) || Date.parse(b.date) < Date.now()+120000) return;
  const names = b.teams.map(normalize).sort().join('|');
  const found = pins.filter(p => !p.isLive && !p.parentId && !p.special && p.participants.length===2 && p.participants.map(x=>normalize(x.name)).sort().join('|')===names && Math.abs(Date.parse(p.startTime)-Date.parse(b.date))<=20*60000);
  return found.length===1 ? found[0] : undefined;
}
export const decimal = (american: number) => american > 0 ? 1 + american/100 : 1 + 100/Math.abs(american);
export function fairProbabilities(odds: number[]) { if (odds.length<2 || odds.some(x=>!Number.isFinite(x)||x<=1)) return []; const weights=odds.map(x=>1/x),sum=weights.reduce((a,b)=>a+b,0); return weights.map(x=>x/sum); }
export function expectedValue(probability: number, odds: number, tax = 0) { return (probability*odds*(1-tax)-1)*100; }
export type MarketKind = 'winner'|'total'|'handicap'|'team_total'|'btts'|'corners';
export const marketLabels:Record<MarketKind,string>={winner:'Zwycięzca / 1X2',total:'Sumy',handicap:'Handicapy',team_total:'Sumy drużyn',btts:'Obie strzelą',corners:'Rożne'};
type Scope='full'|'h1'|'h2'|'q1'|'q2'|'q3'|'q4'|'s1'|'s2'|'s3'|'t1'|'t2'|'t3';
type Unit='goals'|'points'|'runs'|'games'|'sets'|'corners';
type Group={market:Market;kind:MarketKind;type:string;scope:Scope;unit?:Unit;team?:string;line?:number;names:string[];sels:Market['selections'];regulation:boolean};
export type ComparisonStats={read:number;recognized:number;matched:number;missing:number;byKind:Partial<Record<MarketKind,number>>};
const defaultUnits:Record<string,Unit>={football:'goals',basketball:'points',ice_hockey:'goals',handball:'goals',american_football:'points',baseball:'runs',rugby_union:'points',rugby_league:'points',futsal:'goals',water_polo:'goals'};
const halfLine=(n:number)=>Number.isFinite(n)&&Math.abs(Math.abs(n)%1-.5)<1e-8;
const numberFrom=(v:string)=>Number(v.replace(',','.').replace(/−/g,'-'));
function scopeFrom(name:string):{scope:Scope;root:string}|null {
 name=name.replace(/\b([1-4])\s+kw\b/g,'$1 kwarta');
 const words:Record<string,string>={pierwsza:'1',pierwszej:'1',druga:'2',drugiej:'2',trzecia:'3',trzeciej:'3',czwarta:'4',czwartej:'4'};
 name=name.replace(/\b(pierwsza|pierwszej|druga|drugiej|trzecia|trzeciej|czwarta|czwartej)\s+(kwart[aey]|tercj[aei]|set(?:a)?)/g,(_,word,unit)=>`${words[word]} ${unit}`);
 const labels:[RegExp,Scope][]=[
 [/\b(?:1|pierwsza|pierwszej)\s*polow[aey]\b/,'h1'],[/\b(?:2|druga|drugiej)\s*polow[aey]\b/,'h2'],
 ...([1,2,3,4] as const).map(n=>[new RegExp(`\\b${n}\\s*kwart[aey]\\b`),`q${n}` as Scope] as [RegExp,Scope]),
 ...([1,2,3] as const).map(n=>[new RegExp(`\\b${n}\\s*set(?:a)?\\b`),`s${n}` as Scope] as [RegExp,Scope]),
 ...([1,2,3] as const).map(n=>[new RegExp(`\\b${n}\\s*tercj[aei]\\b`),`t${n}` as Scope] as [RegExp,Scope])];
 let root=name,scope:Scope='full';
 for(const [re,key] of labels)if(re.test(root)){if(scope!=='full'&&scope!==key)return null;scope=key;root=root.replace(re,' ');}
 if(/polow|kwart|tercj|pierwsz.*set|drug.*set|\b[4-9] set\b|minut|mapa|runda|inning/.test(root))return null;
 return {scope,root:root.replace(/\s+/g,' ').trim()};
}
function linePick(name:string,type:string):{key:string;line:number}|null{
 if(type==='total'||type==='team_total'){
  const m=name.trim().match(/^(Powyżej|Poniżej|Over|Under)\s+([+-]?\d+(?:[.,]\d+)?)$/i);
  if(!m)return null;const line=numberFrom(m[2]);return halfLine(line)&&line>=0?{key:/^(powy|over)/i.test(m[1])?'over':'under',line}:null;
 }
 const m=name.trim().match(/^(.*?)\s*\(?([+−-]\d+(?:[.,]\d+)?)\)?$/);
 if(!m)return null;const line=numberFrom(m[2]);return halfLine(line)?{key:normalize(m[1]),line}:null;
}
function groupsFor(m:Market,b:Event,sport:string):Group[]{
 if(m.suspended)return [];const n=normalize(m.name);const period=scopeFrom(n);if(!period)return [];
 const {scope,root}=period;const regulation=/wylaczeniem dogrywki|reg czas|regulaminow/.test(root);
 if(scope==='full'&&sport==='basketball'&&regulation)return [];
 const plain=root.replace(/z wylaczeniem dogrywki|reg czas|czas regulaminowy|regulaminowy/g,'').replace(/\s+/g,' ').trim();
 if(/^(wynik meczu|zwyciezca meczu|zwyciezca spotkania|zwyciezca walki|wynik|zwyciezca)$/.test(plain)){
  if(sport==='ice_hockey'&&scope==='full'&&!regulation&&plain!=='zwyciezca meczu')return [];
  const sels=m.selections;const names=sels.map(s=>normalize(s.name));
  if(![2,3].includes(sels.length)||new Set(names).size!==sels.length||names.some(x=>x!=='remis'&&!b.teams.map(normalize).includes(x)))return [];
  if(['football','handball','futsal','water_polo'].includes(sport)&&sels.length!==3)return [];
  if(sport==='basketball'&&scope==='full'&&sels.length===3)return []; // regulation 1X2 has a different period contract
  // Two-way period moneylines can refund draws. A binary EV formula would overstate EV.
  if(scope!=='full'&&sels.length===2&&!['tennis','volleyball','table_tennis','badminton'].includes(sport))return [];
  return [{market:m,kind:'winner',type:'moneyline',scope,names,sels,regulation}];
 }
 if(sport==='football'&&/^oba zespoly strzela gola$/.test(plain)&&m.selections.length===2){
  const names=m.selections.map(s=>normalize(s.name)==='tak'?'yes':normalize(s.name)==='nie'?'no':'');
  return names.includes('yes')&&names.includes('no')?[{market:m,kind:'btts',type:'moneyline',scope,names,sels:m.selections,regulation:true}]:[];
 }
 // Combinations and props cannot be interpreted as totals just because their labels contain a unit.
 if(/doklad|parzyst|wynik i|strzel|zawodnik|pierwszy gol|ostatni gol|przewaga|wygrana|\boba\b|\blub\b/.test(root))return [];
 const teamNames=b.teams.map(normalize).filter(t=>` ${root} `.includes(` ${t} `));if(teamNames.length>1)return [];
 const team=teamNames[0];let unit:Unit|undefined;
 if(/\brozn/.test(root))unit='corners';else if(/\bgem/.test(root))unit='games';else if(/liczba setow|suma setow|handicap set/.test(root))unit='sets';else if(/\bgol|\bbramek|\bbramki/.test(root))unit='goals';else if(/\bpunkt/.test(root))unit='points';else if(/\brunow|\bobieg/.test(root))unit='runs';
 const isHandicap=/handicap/.test(root);
 if(!unit&&isHandicap)unit=defaultUnits[sport];
 if(!unit)return [];
 if(!isHandicap&&unit!=='corners'&&!/(suma|liczba|powyzej|ponizej|^gole)/.test(root))return [];
 if(isHandicap&&m.selections.some(s=>normalize(s.name).startsWith('remis')))return []; // European 3-way handicap is not an Asian spread.
 const type=isHandicap?'spread':team?'team_total':'total';const buckets=new Map<number,{sels:Market['selections'];names:string[]}>();
 for(const s of m.selections){const pick=linePick(s.name,type);if(!pick)continue;
  if(type==='spread'&&!b.teams.map(normalize).includes(pick.key))continue;
  const line=type==='spread'?(pick.key===normalize(b.teams[0])?pick.line:-pick.line):pick.line;
  const g=buckets.get(line)||{sels:[],names:[]};g.sels.push(s);g.names.push(pick.key);buckets.set(line,g);
 }
 const kind:MarketKind=unit==='corners'?'corners':isHandicap?'handicap':team?'team_total':'total';
 return [...buckets].flatMap(([line,g])=>g.sels.length===2&&new Set(g.names).size===2?[{market:m,kind,type,scope,unit,team,line,names:g.names,sels:g.sels,regulation}]:[]);
}
function pinPeriod(g:Group,sport:string):number|null{
 if(g.scope==='full')return sport==='ice_hockey'&&g.regulation?6:0;
 if(g.scope==='h1'&&['football','basketball','handball','american_football','rugby_union','rugby_league'].includes(sport))return 1;
 if(g.scope==='h2'&&sport==='football')return 8;
 if(/^q[1-4]$/.test(g.scope)&&['basketball','american_football'].includes(sport))return Number(g.scope[1])+2;
 if(/^s[1-3]$/.test(g.scope)&&['tennis','volleyball','table_tennis','badminton'].includes(sport))return Number(g.scope[1]);
 if(/^t[1-3]$/.test(g.scope)&&sport==='ice_hockey')return Number(g.scope[1]);
 return null;
}
function sourceUnit(p:PinEvent,sport:string):Unit|undefined{
 const units:Record<string,Unit>={corners:'corners',games:'games',sets:'sets',points:'points',goals:'goals',runs:'runs'};
 return units[(p.units||'Regular').toLowerCase()]||((!p.units||p.units==='Regular')?defaultUnits[sport]:undefined);
}
function contextFor(g:Group,p:PinEvent,events:PinEvent[],sport:string):PinEvent[]{
 if(g.kind==='winner')return [p];
 if(g.kind==='btts'){
  const description=g.scope==='full'?'Both Teams To Score?':g.scope==='h1'?'Both Teams To Score? 1st Half':g.scope==='h2'?'Both Teams To Score? 2nd Half':'';
  return events.filter(x=>x.parentId===p.id&&!x.isLive&&x.special?.description===description);
 }
 return [p,...events.filter(x=>x.parentId===p.id)].filter(x=>!x.isLive&&!x.special&&sourceUnit(x,sport)===g.unit&&Math.abs(Date.parse(x.startTime)-Date.parse(p.startTime))<=120000&&x.participants.length===2&&x.participants.every(part=>{const parent=p.participants.find(y=>y.alignment===part.alignment);return parent&&normalize(part.name.replace(/\s*\((?:Corners|Games|Points|Sets)\)\s*$/i,''))===normalize(parent.name);}));
}
function refKeys(g:Group,p:PinEvent,context:PinEvent,r:PinMarket):string[]{
 return r.prices.map(price=>{
  if(g.kind==='btts')return normalize(context.participants.find(x=>x.id===price.participantId)?.name||price.designation||'');
  if(g.type==='total'||g.type==='team_total')return price.designation||'';
  if(price.designation==='draw')return 'remis';
  const part=price.participantId?context.participants.find(x=>x.id===price.participantId):p.participants.find(x=>x.alignment===price.designation);
  return part?normalize(part.name.replace(/\s*\((?:Corners|Games|Points|Sets)\)\s*$/i,'')):'';
 });
}
const scopeLabels:Record<Scope,string>={full:'Cały mecz',h1:'1. połowa',h2:'2. połowa',q1:'1. kwarta',q2:'2. kwarta',q3:'3. kwarta',q4:'4. kwarta',s1:'1. set',s2:'2. set',s3:'3. set',t1:'1. tercja',t2:'2. tercja',t3:'3. tercja'};
export function compareDetailed(b:Event,p:PinEvent,pinMarkets:PinMarket[],sport:string,refAt:number,events:PinEvent[]=[]):{rows:Opportunity[];stats:ComparisonStats}{
 const now=Date.now(),rows:Opportunity[]=[];const stats:ComparisonStats={read:b.markets.length,recognized:0,matched:0,missing:0,byKind:{}};
 if(now-refAt>300000||refAt>now+10000||!matchEvent(b,[p]))return {rows,stats};
 const seen=new Set<string>();
 const relatedIds=new Set([p.id,...events.filter(e=>e.parentId===p.id).map(e=>e.id)]);
 const localMarkets=pinMarkets.filter(r=>relatedIds.has(r.matchupId));
 for(const m of b.markets.slice().reverse())for(const g of groupsFor(m,b,sport)){
  const signature=`${g.type}-${g.scope}-${g.unit}-${g.team}-${g.line}-${g.names.slice().sort().join('|')}`;if(seen.has(signature))continue;seen.add(signature);stats.recognized++;
  const period=pinPeriod(g,sport);const contexts=contextFor(g,p,events,sport);const candidates:{r:PinMarket;context:PinEvent;keys:string[]}[]=[];
  for(const context of contexts)for(const r of localMarkets){
   if(r.matchupId!==context.id||r.type!==g.type||r.period!==period||r.prices.length!==g.sels.length||r.status&&r.status!=='open'||!Number.isFinite(Date.parse(r.cutoffAt))||Date.parse(r.cutoffAt)<=now)continue;
   if(g.type==='team_total'&&normalize(p.participants.find(x=>x.alignment===r.side)?.name||'')!==g.team)continue;
   const keys=refKeys(g,p,context,r);if(keys.some(x=>!x)||keys.slice().sort().join('|')!==g.names.slice().sort().join('|'))continue;
   if(g.line!==undefined){
    if(g.type==='spread'){if(r.prices.some((price,i)=>price.points!==linePick(g.sels[g.names.indexOf(keys[i])].name,'spread')?.line))continue;}
    else if(r.prices.some(price=>price.points!==g.line))continue;
   }
   candidates.push({r,context,keys});
  }
  if(candidates.length!==1){stats.missing++;continue;}
  const {r,context,keys}=candidates[0],odds=r.prices.map(x=>decimal(x.price)),probabilities=fairProbabilities(odds);
  if(probabilities.length!==g.sels.length||Math.abs(odds.reduce((sum,o)=>sum+1/o,0)-1)>.18){stats.missing++;continue;}
  stats.matched++;stats.byKind[g.kind]=(stats.byKind[g.kind]||0)+1;
  for(let i=0;i<g.sels.length;i++){
   const s=g.sels[i],idx=keys.indexOf(g.names[i]),probability=probabilities[idx],ev=expectedValue(probability,s.odds);
   if(!Number.isFinite(ev)||ev<=0||ev>25)continue;
   const rule=g.scope!=='full'?scopeLabels[g.scope]:g.regulation||sport==='football'?'Czas regulaminowy':sport==='basketball'?'Cały mecz, z dogrywką':sport==='ice_hockey'?'Z dogrywką i rzutami karnymi':'Całe spotkanie';
   rows.push({id:`${b.id}-${context.id}-${r.key}-${g.names[i]}`,sport,event:b.name,league:b.competition,start:b.date,market:m.name,pick:s.name,odds:s.odds,reference:odds[idx],fair:1/probability,probability,ev,observedAt:now,referenceAt:refAt,eventId:b.id,pinId:context.id,referenceOdds:odds,settlement:rule,kind:g.kind,period:g.scope});
  }
 }
 return {rows,stats};
}
export function compareMarkets(b:Event,p:PinEvent,pinMarkets:PinMarket[],sport:string,refAt:number,events:PinEvent[]=[]):Opportunity[]{return compareDetailed(b,p,pinMarkets,sport,refAt,events).rows;}
export async function inventory(key: string, offset: number) {
  const sport=(await sports()).find(x=>x.key===key); if(!sport || !sport.pinnacleId) throw new Error('Brak wspólnego źródła dla tego sportu');
  const [events,ref]=await Promise.all([cached(`bet-${key}-${offset}`,()=>getEvents(key,offset),120),reference(sport.pinnacleId)]);
  const pairs=events.map(b=>({b,p:matchEvent(b,ref.events)})).filter((x): x is {b:Event;p:PinEvent}=>!!x.p);
  return { events:events.length,matched:pairs.length,pairs:pairs.map(x=>({id:x.b.id,pinId:x.p.id})),next:events.length>=40?offset+40:null,referenceAt:ref.observedAt,firstId:events[0]?.id||null };
}
export async function scan(key: string, ids: number[]) {
  const sport=(await sports()).find(x=>x.key===key); if(!sport?.pinnacleId) throw new Error('Nieobsługiwany sport');
  const ref=await reference(sport.pinnacleId);const rows:Opportunity[]=[];let checked=0;const errors:string[]=[];
  // Small batches keep requests bounded and respect the upstream services.
  for(let i=0;i<ids.length;i+=2) await Promise.all(ids.slice(i,i+2).map(async id=> {
    try {const b=await cached(`detail-${id}`,()=>getExpandedEvent(id),60);const p=matchEvent(b,ref.events);if(p){rows.push(...compareMarkets(b,p,ref.markets,key,ref.observedAt,ref.events));checked++;}}
    catch(e){errors.push(`${id}: ${e instanceof Error?e.message:'Błąd odczytu'}`);}
  }));
  return {rows,checked,errors,observedAt:Date.now()};
}
