import { mkdir, writeFile } from 'node:fs/promises';
import { runExperiment, PROFILES, MODEL_VERSION } from '../public/src/model.js';
const seeds=[42,43,44,45,46], records=[];
for(const scenario of ['nominal','congestion','weak','outage']) {
  for(const profile of Object.keys(PROFILES)) {
    for(const seed of seeds) records.push(runExperiment({scenario,profile,seed}));
  }
}
const rows=[];
for(const scenario of ['nominal','congestion','weak','outage']) for(const profile of Object.keys(PROFILES)) {
  const runs=records.filter(r=>r.config.scenario===scenario&&r.config.profile===profile);
  const avg=k=>runs.reduce((s,r)=>s+r.metrics[k],0)/runs.length;
  rows.push({scenario,profile,label:PROFILES[profile].label,sent:runs[0].metrics.sent,
    p95Mean:avg('p95'),p95Min:Math.min(...runs.map(r=>r.metrics.p95)),p95Max:Math.max(...runs.map(r=>r.metrics.p95)),
    onTimeMean:avg('onTimeRate'),lossMean:avg('lossRate')});
}
const out=new URL('../results/',import.meta.url); await mkdir(out,{recursive:true});
await writeFile(new URL('experiments.json',out),JSON.stringify({modelVersion:MODEL_VERSION,seeds,duration:60,definition:'Moyenne des métriques par graine ; p95 calculé sur les paquets livrés, après vidange.',summary:rows,runs:records},null,2)+'\n');
await writeFile(new URL('summary.csv',out),'scenario,profile,sent,p95_mean_ms,p95_min_ms,p95_max_ms,on_time_mean_percent,loss_mean_percent\n'+rows.map(r=>[r.scenario,r.profile,r.sent,r.p95Mean.toFixed(4),r.p95Min.toFixed(4),r.p95Max.toFixed(4),r.onTimeMean.toFixed(4),r.lossMean.toFixed(4)].join(',')).join('\n')+'\n');
console.table(rows.map(r=>({...r,p95Mean:r.p95Mean.toFixed(2),onTimeMean:r.onTimeMean.toFixed(2),lossMean:r.lossMean.toFixed(2)})));
