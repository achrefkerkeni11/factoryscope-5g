/**
 * FactoryScope 5G — modèle pédagogique, sans mesure radio ni pile MQTT.
 * Les paramètres sont des hypothèses modifiables, pas des valeurs normatives.
 * Temps en ms, capacité utile en Mbit/s décimaux, taille en octets.
 */
export const MODEL_VERSION = '1.0.0';
export const PROFILES = Object.freeze({
  edge: { label:'5G privée + edge', short:'5G / edge', capacity:8, radio:3, core:1.5, transport:1, processing:1.5, jitter:2, loss:0.001, color:'#087e83' },
  cloud:{ label:'5G + cloud distant', short:'5G / cloud', capacity:8, radio:3, core:1.5, transport:35, processing:3, jitter:8, loss:0.001, color:'#5572bf' },
  wifi: { label:'Wi-Fi de référence', short:'Wi-Fi / local', capacity:4, radio:6, core:1, transport:2, processing:2, jitter:12, loss:0.008, color:'#d98336' }
});
export const SCENARIOS = Object.freeze({
  nominal: { label:'Production nominale', detail:'Trafic régulier, aucune perturbation.' },
  congestion: { label:'Congestion réseau', detail:'De 20 à 40 s, capacité disponible ramenée à 15 %.' },
  weak: { label:'Liaison dégradée', detail:'De 20 à 40 s : +15 ms fixes, +25 ms de gigue, +4 points de perte.' },
  outage: { label:'Coupure de liaison', detail:'Aucune livraison entre 20 et 30 s ; la production continue.' },
  heat: { label:'Surchauffe machine B', detail:'À partir de 20 s : hausse de température et de rebuts, réseau inchangé.' }
});
export const DEFAULTS = Object.freeze({ profile:'edge', scenario:'nominal', devices:120, frequency:5, payload:256, overhead:64, deadline:50, buffer:100, seed:42 });

export function configOf(input = {}) {
  const c = { ...DEFAULTS, ...input };
  if (!PROFILES[c.profile] || !SCENARIOS[c.scenario]) throw new Error('Profil ou scénario inconnu.');
  for (const [key,min,max] of [['devices',1,400],['frequency',1,10],['payload',1,4096],['overhead',0,1024],['deadline',1,1000],['buffer',0,1000],['seed',0,4294967295]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`Paramètre invalide : ${key}`);
  }
  return c;
}

// Hachage 32 bits : mêmes tirages pour un indice de paquet donné sur chaque profil.
export function randomAt(seed, index, stream = 0) {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(stream + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export function offeredLoad(c) { return c.devices * c.frequency * (c.payload + c.overhead) * 8 / 1e6; }
export function incidentAt(c, t) {
  const active = t >= 20000 && t < 40000;
  return { capacityFactor:c.scenario === 'congestion' && active ? 0.15 : 1,
    extraDelay:c.scenario === 'weak' && active ? 15 : 0,
    extraJitter:c.scenario === 'weak' && active ? 25 : 0,
    extraLoss:c.scenario === 'weak' && active ? 0.04 : 0,
    outage:c.scenario === 'outage' && t >= 20000 && t < 30000 };
}

export class NetworkSimulation {
  constructor(input = {}, { keepRecords = true } = {}) {
    this.config = configOf(input); this.keepRecords = keepRecords;
    this.time = 0; this.count = 0; this.serviceEnd = 0;
    this.records = []; this.pending = []; this.latencies = [];
    this.delivered = 0; this.onTime = 0; this.dropped = 0;
    this.reasons = { random:0, buffer:0, outage:0 };
    this.lastReceived = [-Infinity,-Infinity]; this.lastGenerated = [-Infinity,-Infinity];
  }
  packet(i) {
    const c = this.config, p = PROFILES[c.profile], t = i * 1000 / (c.devices * c.frequency), inc = incidentAt(c,t);
    const r = { id:i, sensor:i % c.devices, line:i % 2, emitted:t, received:null, latency:null, waiting:0, status:'', reason:'' };
    const jitterDraw = randomAt(c.seed,i,0), lossDraw = randomAt(c.seed,i,1);
    if (inc.outage) { r.status='lost'; r.reason='outage'; return r; }
    const waiting = Math.max(0,this.serviceEnd-t);
    r.waiting = waiting;
    if (waiting > c.buffer + 1e-9) { r.status='lost'; r.reason='buffer'; return r; }
    const serialization = 8 * (c.payload+c.overhead) / (p.capacity * inc.capacityFactor * 1000);
    this.serviceEnd = Math.max(this.serviceEnd,t) + serialization;
    if (lossDraw < p.loss + inc.extraLoss) { r.status='lost'; r.reason='random'; return r; }
    r.latency = waiting + serialization + p.radio + p.core + p.transport + p.processing + inc.extraDelay + jitterDraw * (p.jitter+inc.extraJitter);
    r.received = t + r.latency;
    r.status = r.latency <= c.deadline ? 'on-time' : 'late';
    return r;
  }
  receive(r) {
    this.delivered++; this.latencies.push(r.latency);
    if (r.status === 'on-time') this.onTime++;
    this.lastReceived[r.line] = Math.max(this.lastReceived[r.line],r.received);
    this.lastGenerated[r.line] = Math.max(this.lastGenerated[r.line],r.emitted);
  }
  advance(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 60000) throw new Error('Pas de simulation invalide.');
    const end = this.time + dt, c = this.config;
    // Une émission à t=end appartient au pas suivant : fenêtre [0,T[.
    const target = Math.ceil(end * c.devices * c.frequency / 1000 - 1e-9);
    for (; this.count < target; this.count++) {
      const r = this.packet(this.count);
      if (this.keepRecords) this.records.push(r);
      if (r.status === 'lost') { this.dropped++; this.reasons[r.reason]++; }
      else this.pending.push(r);
    }
    this.time = end;
    const waiting = [];
    for (const r of this.pending) { if (r.received <= end) this.receive(r); else waiting.push(r); }
    this.pending = waiting;
    return this.metrics(false);
  }
  drain() { for (const r of this.pending) this.receive(r); this.pending=[]; return this.metrics(); }
  metrics(withQuantiles = true) {
    return { sent:this.count, delivered:this.delivered, dropped:this.dropped, pending:this.pending.length,
      onTime:this.onTime, late:this.delivered-this.onTime,
      onTimeRate:this.count ? 100*this.onTime/this.count : 0,
      lossRate:this.count ? 100*this.dropped/this.count : 0,
      p50:withQuantiles ? percentile(this.latencies,0.50) : null,
      p95:withQuantiles ? percentile(this.latencies,0.95) : null,
      p99:withQuantiles ? percentile(this.latencies,0.99) : null,
      mean:this.latencies.length ? this.latencies.reduce((a,b)=>a+b,0)/this.latencies.length : null,
      load:offeredLoad(this.config), reasons:{...this.reasons} };
  }
}
export function runExperiment(input = {}, duration = 60, keepRecords = false) {
  if (!Number.isInteger(duration) || duration < 1 || duration > 180) throw new Error('Durée : 1 à 180 s.');
  const sim = new NetworkSimulation(input,{keepRecords});
  for (let t=0;t<duration;t++) sim.advance(1000);
  const metrics = sim.drain();
  return { modelVersion:MODEL_VERSION, config:sim.config, duration, metrics, ...(keepRecords ? {records:sim.records} : {}) };
}

export class FactorySimulation {
  constructor(seed=42) {
    this.seed=seed; this.time=0;
    this.lines=[{name:'Assemblage',rate:0.85},{name:'Conditionnement',rate:0.90}].map((x,i)=>({...x,id:i,stopped:false,running:0,total:0,good:0,progress:0,temperature:58+i*4}));
  }
  toggle(i) { this.lines[i].stopped = !this.lines[i].stopped; return this.lines[i].stopped; }
  advance(dt,scenario) {
    this.time += dt;
    for (const m of this.lines) {
      const hot = scenario === 'heat' && m.id === 1 && this.time >= 20000;
      m.temperature = (m.stopped ? 44 : hot ? 88 : 58+m.id*4) + 1.5*Math.sin(this.time/4000 + m.id);
      if (m.stopped) continue;
      m.running += dt/1000; m.progress += m.rate*dt/1000;
      while (m.progress >= 1-1e-10) {
        m.progress=Math.max(0,m.progress-1); m.total++;
        if (randomAt(this.seed+100+m.id,m.total,4) >= (hot ? 0.12 : 0.025)) m.good++;
      }
    }
  }
  metrics() {
    const planned = this.time/1000*this.lines.length;
    const running = this.lines.reduce((s,l)=>s+l.running,0), total=this.lines.reduce((s,l)=>s+l.total,0), good=this.lines.reduce((s,l)=>s+l.good,0);
    const availability=planned ? running/planned : 0, performance=running ? total/running : 0, quality=total ? good/total : 0;
    return {planned,running,total,good,availability,performance,quality,oee:availability*performance*quality};
  }
}

export function recordsToCsv(records) {
  const header='packet_id,sensor_id,line_id,emitted_ms,received_ms,latency_ms,queue_ms,status,reason';
  return header+'\n'+records.map(r=>[r.id,r.sensor,r.line,r.emitted.toFixed(6),r.received?.toFixed(6)??'',r.latency?.toFixed(6)??'',r.waiting.toFixed(6),r.status,r.reason].join(',')).join('\n')+'\n';
}
