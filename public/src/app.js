import { DEFAULTS, PROFILES, SCENARIOS, MODEL_VERSION, configOf, offeredLoad, NetworkSimulation, FactorySimulation, runExperiment, recordsToCsv } from './model.js';
const $ = id => document.getElementById(id);
const fmt = (x,n=1) => Number.isFinite(x) ? x.toLocaleString('fr-FR',{minimumFractionDigits:n,maximumFractionDigits:n}) : '—';
const clock = t => `${String(Math.floor(t/60000)).padStart(2,'0')}:${String(Math.floor(t/1000)%60).padStart(2,'0')}`;
let config={...DEFAULTS}, network, factory, factorySnapshots=[], playing=false, history=[], events=[], comparison=null, toastTimer;
try { const stored=JSON.parse(localStorage.getItem('factoryscope-config')); if(stored) config=configOf(stored); } catch {}
const formKeys=['profile','scenario','devices','seed'];
for(const key of formKeys) $(key).value=config[key];
function toast(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,4200); }
function addEvent(text) { events.unshift({time:network.time,text}); events=events.slice(0,40); }
function setPlaying(value) { playing=value; $('play').innerHTML=value?'❚❚ &nbsp; Pause':'<span aria-hidden="true">▶︎</span> '+(network.time?'Reprendre':'Démarrer'); $('run-state').textContent=value?'Simulation en cours':network.time>=120000?'Fin de session (120 s)':network.time?'Simulation en pause':'Prêt à démarrer'; }
function reset() {
  network=new NetworkSimulation(config); factory=new FactorySimulation(config.seed); history=[]; events=[];
  factorySnapshots=[factory.lines.map(line=>({...line}))];
  setPlaying(false); comparison=null; $('export-compare').disabled=true;
  $('compare-results').innerHTML='<div class="panel empty-state">Lancez une comparaison pour obtenir les résultats.</div>';
  $('compare-table').textContent=''; $('compare-summary').textContent='';
  addEvent(`${PROFILES[config.profile].label} · ${config.devices} capteurs · graine ${config.seed}.`);
  $('scenario-detail').textContent=SCENARIOS[config.scenario].detail;
  $('load-label').textContent=`Charge offerte : ${fmt(offeredLoad(config),3)} Mbit/s`;
  const p=PROFILES[config.profile];
  $('path-stack').innerHTML=[['Accès radio',p.radio],['Cœur / passerelle',p.core],['Transport',p.transport],['Traitement',p.processing]].map(([label,value])=>`<div class="path-node">${label}<strong>${fmt(value)} ms</strong></div>`).join('');
  $('capacity-label').textContent=`${p.capacity} Mbit/s`;
  buildMachines(); render();
}
function advanceOne() {
  if(network.time>=120000) { setPlaying(false); return; }
  const before=network.time;
  factory.advance(200,config.scenario);
  factorySnapshots.push(factory.lines.map(line=>({...line})));
  network.advance(200);
  if(before<20000 && network.time>=20000 && config.scenario!=='nominal') addEvent(`Début : ${SCENARIOS[config.scenario].label.toLowerCase()}.`);
  const recovery=config.scenario==='outage'?30000:['congestion','weak'].includes(config.scenario)?40000:Infinity;
  if(before<recovery && network.time>=recovery) addEvent('Fin de la perturbation réseau ; retour au profil nominal.');
  if(network.time%1000===0) {
    const m=network.metrics(); history.push({time:network.time/1000,p95:m.p95});
  }
  if(network.time===120000) { addEvent('Session terminée à 120 s. Exportez les résultats ou réinitialisez.'); setPlaying(false); }
}
function chartSvg() {
  const w=640,h=214,left=38,right=8,top=16,bottom=29,iw=w-left-right,ih=h-top-bottom;
  const maxY=Math.max(60, Math.ceil(Math.max(...history.map(x=>x.p95??0),0)/20)*20);
  const maxT=Math.max(60,network.time/1000), X=x=>left+x/maxT*iw, Y=y=>top+ih-y/maxY*ih;
  let grid='';
  for(let i=0;i<=3;i++){const v=maxY*i/3;grid+=`<line x1="${left}" y1="${Y(v)}" x2="${w-right}" y2="${Y(v)}" stroke="#e6eeeb"/><text x="${left-9}" y="${Y(v)+3}" text-anchor="end" font-size="9" fill="#81958f">${Math.round(v)}</text>`;}
  for(let i=0;i<=4;i++){const v=maxT*i/4;grid+=`<text x="${X(v)}" y="${h-7}" text-anchor="middle" font-size="9" fill="#81958f">${Math.round(v)} s</text>`;}
  const points=history.filter(x=>x.p95!==null).map(x=>[X(x.time),Y(x.p95)]);
  const line=points.map(x=>x.join(',')).join(' ');
  const area=points.length?`<polygon points="${points[0][0]},${top+ih} ${line} ${points.at(-1)[0]},${top+ih}" fill="url(#area)"/>`:'';
  const dots=history.filter(x=>x.p95!==null).map(x=>`<circle cx="${X(x.time)}" cy="${Y(x.p95)}" r="3" fill="transparent"><title>${x.time} s : ${fmt(x.p95,2)} ms (p95 cumulé)</title></circle>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Latence p95 cumulée selon le temps simulé"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5cc5af" stop-opacity=".22"/><stop offset="1" stop-color="#5cc5af" stop-opacity="0"/></linearGradient></defs>${grid}<line x1="${left}" y1="${Y(50)}" x2="${w-right}" y2="${Y(50)}" stroke="#d98336" stroke-width="1" stroke-dasharray="4 4"/>${area}${points.length?`<polyline points="${line}" stroke="#087e83" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`:''}${dots}${!points.length?`<text x="${w/2}" y="${h/2}" text-anchor="middle" fill="#82958f" font-size="11">Démarrez une simulation pour observer la courbe.</text>`:''}<text x="${left}" y="9" fill="#82958f" font-size="8">ms</text></svg>`;
}
const machineIcon='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 26V13l8 5V10l9 6V5h6v21H4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 23v-3m7 3v-3m7 3v-3" stroke="currentColor" stroke-width="2"/></svg>';
function buildMachines() {
  $('machines').innerHTML=factory.lines.map(line=>`<article class="machine"><div class="machine-top"><div class="machine-icon">${machineIcon}</div><div class="machine-title"><span>LIGNE ${line.id===0?'A':'B'} / M-${line.id+1}01</span><h3>${line.name}</h3></div><span id="machine-badge-${line.id}" class="machine-badge"></span></div><div class="machine-stats"><div><span>Pièces produites</span><strong id="machine-count-${line.id}">—</strong></div><div><span>Qualité</span><strong id="machine-quality-${line.id}">—</strong> <small>%</small></div><div><span>Température</span><strong id="machine-temperature-${line.id}">—</strong> <small>°C</small></div></div><div class="machine-bottom"><span id="machine-age-${line.id}"></span><button id="machine-toggle-${line.id}" class="button secondary machine-toggle" data-line="${line.id}">Arrêter la production</button></div></article>`).join('');
}
function render() {
  const m=network.metrics(), f=factory.metrics();
  $('clock').textContent=clock(network.time);
  $('latency').textContent=fmt(m.p95); $('ontime').textContent=m.sent?fmt(m.onTimeRate):'—'; $('loss').textContent=m.sent?fmt(m.lossRate,2):'—'; $('oee').textContent=f.total?fmt(f.oee*100):'—';
  $('packet-count').textContent=`${fmt(m.sent,0)} émis · ${m.pending} en vol`;
  for(const [key,value] of [['latency',Math.min(100,100*(m.p95||0)/50)],['ontime',m.onTimeRate],['loss',Math.min(100,m.lossRate*5)],['oee',100*f.oee]]) $(key+'-track').style.width=`${value}%`;
  $('latency-chart').innerHTML=chartSvg();
  factory.lines.forEach(line=>{
    const noData=!Number.isFinite(network.lastReceived[line.id]);
    const age=network.time-network.lastReceived[line.id],stale=noData||age>3000;
    const snapshotIndex=noData?0:Math.min(factorySnapshots.length-1,Math.max(0,Math.floor(network.lastGenerated[line.id]/200)));
    const snapshot=factorySnapshots[snapshotIndex][line.id];
    const hot=snapshot.temperature>80;
    const status=stale?(network.time?'Données périmées':'En attente'):line.stopped?'Arrêt ordinaire':hot?'Température élevée':'En production';
    const badge=$('machine-badge-'+line.id); badge.textContent=status; badge.className='machine-badge '+(stale?'off':hot||line.stopped?'warn':'');
    $('machine-count-'+line.id).textContent=stale?'—':fmt(snapshot.total,0);
    $('machine-quality-'+line.id).textContent=stale||!snapshot.total?'—':fmt(snapshot.good/snapshot.total*100,1);
    $('machine-temperature-'+line.id).textContent=stale?'—':fmt(snapshot.temperature,1);
    $('machine-age-'+line.id).textContent=stale?'Valeurs masquées sans télémétrie récente':`Dernière réception : il y a ${fmt(Math.max(0,age)/1000,2)} s`;
    const button=$('machine-toggle-'+line.id); button.disabled=stale; button.textContent=line.stopped?'Reprendre la production':'Arrêter la production';
  });
  $('event-log').innerHTML=events.slice(0,8).map(e=>`<li><time>${clock(e.time*1)}</time><span>${e.text}</span></li>`).join('');
  $('event-count').textContent=`${events.length} événement${events.length>1?'s':''}`;
  $('export-json').disabled=!m.sent; $('export-csv').disabled=!m.sent; $('step').disabled=network.time>=120000; $('play').disabled=network.time>=120000;
}
function switchView(name) {
  if(!['atelier','compare','method'].includes(name)) name='atelier';
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+name);
  document.querySelectorAll('.nav-item').forEach(b=>{ const active=b.dataset.view===name;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current'); });
  $('breadcrumb-title').textContent={atelier:'Atelier connecté',compare:'Comparaison des réseaux',method:'Modèle & méthode'}[name];
  if(name!=='atelier') setPlaying(false);
  if(location.hash!=='#'+name) historyApi(name);
  window.scrollTo({top:0,behavior:'instant'});
}
function historyApi(name){window.history.replaceState(null,'','#'+name);}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
window.addEventListener('hashchange',()=>switchView(location.hash.slice(1)));
$('config-form').addEventListener('submit',e=>{
  e.preventDefault(); if(!$('config-form').reportValidity()) return;
  try {
    config=configOf({...config,profile:$('profile').value,scenario:$('scenario').value,devices:Number($('devices').value),seed:Number($('seed').value)});
    try{localStorage.setItem('factoryscope-config',JSON.stringify(config));}catch{}
    reset();toast('Configuration appliquée. Une nouvelle session est prête.');
  } catch(error){toast(error.message);}
});
$('play').addEventListener('click',()=>setPlaying(!playing));
$('reset').addEventListener('click',()=>{reset();toast('Session réinitialisée.');});
$('step').addEventListener('click',()=>{setPlaying(false);for(let i=0;i<50&&network.time<120000;i++)advanceOne();setPlaying(false);render();});
$('machines').addEventListener('click',e=>{
  const button=e.target.closest('.machine-toggle'); if(!button) return;
  const id=Number(button.dataset.line),stopped=factory.toggle(id);
  addEvent(`Commande locale simulée : ligne ${id===0?'A':'B'} ${stopped?'arrêtée':'relancée'}.`);render();
});
setInterval(()=>{if(!playing)return;for(let i=0;i<Number($('speed').value);i++)advanceOne();render();},200);
function download(name,content,mime) {
  const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  toast('Export préparé : '+name);
}
function sessionRecords(){return network.records.map(r=>r.received!==null&&r.received>network.time?{...r,status:'in-flight'}:{...r});}
$('export-json').addEventListener('click',()=>download(`factoryscope-session-${config.seed}.json`,JSON.stringify({modelVersion:MODEL_VERSION,kind:'simulation',config,elapsedMs:network.time,metrics:network.metrics(),factory:factory.metrics(),events,notes:'received est le temps planifié ; status=in-flight si non encore reçu au moment de cet export.',records:sessionRecords()},null,2),'application/json'));
$('export-csv').addEventListener('click',()=>download(`factoryscope-paquets-${config.seed}.csv`,recordsToCsv(sessionRecords()),'text/csv;charset=utf-8'));
$('compare-run').addEventListener('click',async()=>{
  $('compare-run').disabled=true; $('compare-run').textContent='Calcul des trois profils…';
  await new Promise(resolve=>setTimeout(resolve,30));
  try {
    comparison=Object.keys(PROFILES).map(profile=>runExperiment({...config,profile},60));
    $('compare-summary').innerHTML=[SCENARIOS[config.scenario].label,`${config.devices} capteurs`,`5 messages/s/capteur`,`Graine ${config.seed}`,'60 s + vidange'].map(s=>`<span>${s}</span>`).join('');
    $('compare-results').innerHTML=comparison.map(r=>{
      const p=PROFILES[r.config.profile],m=r.metrics;
      return `<article class="panel compare-card" style="--profile-color:${p.color}"><div class="eyebrow">${r.config.profile==='edge'?'PROFIL A':r.config.profile==='cloud'?'PROFIL B':'PROFIL C'}</div><h2>${p.label}</h2><div class="result-number">${fmt(m.p95,2)} <small>ms</small></div><div class="result-label">LATENCE P95</div><dl><div><dt>Livrés en ≤ 50 ms</dt><dd>${fmt(m.onTimeRate,2)} %</dd></div><div><dt>Pertes</dt><dd>${fmt(m.lossRate,2)} %</dd></div><div><dt>Émissions</dt><dd>${fmt(m.sent,0)}</dd></div></dl></article>`;
    }).join('');
    $('compare-table').innerHTML=`<div class="table-scroll"><table><caption>Résultats de simulation ; quantiles sur les paquets reçus, après vidange.</caption><thead><tr><th>Profil</th><th>Médiane</th><th>p95</th><th>p99</th><th>Pertes aléatoires</th><th>File saturée</th><th>Coupure</th></tr></thead><tbody>${comparison.map(r=>`<tr><td>${PROFILES[r.config.profile].short}</td><td>${fmt(r.metrics.p50,2)} ms</td><td>${fmt(r.metrics.p95,2)} ms</td><td>${fmt(r.metrics.p99,2)} ms</td><td>${r.metrics.reasons.random}</td><td>${r.metrics.reasons.buffer}</td><td>${r.metrics.reasons.outage}</td></tr>`).join('')}</tbody></table></div>`;
    $('export-compare').disabled=false;
  } catch(error){toast(error.message);}finally{$('compare-run').disabled=false;$('compare-run').textContent='Relancer la comparaison →';}
});
$('export-compare').addEventListener('click',()=>{if(comparison)download(`factoryscope-comparaison-${config.seed}.json`,JSON.stringify({kind:'simulation',results:comparison},null,2),'application/json');});
$('profile-table').innerHTML=`<div class="table-scroll"><table><thead><tr><th>Profil</th><th>Capacité</th><th>Radio</th><th>Cœur</th><th>Transport</th><th>Traitement</th><th>Gigue U[0,J]</th><th>Perte</th></tr></thead><tbody>${Object.values(PROFILES).map(p=>`<tr><td>${p.short}</td><td>${p.capacity} Mbit/s</td><td>${fmt(p.radio)} ms</td><td>${fmt(p.core)} ms</td><td>${fmt(p.transport)} ms</td><td>${fmt(p.processing)} ms</td><td>${p.jitter} ms</td><td>${fmt(p.loss*100,1)} %</td></tr>`).join('')}</tbody></table></div>`;
reset();switchView(location.hash.slice(1)||'atelier');
