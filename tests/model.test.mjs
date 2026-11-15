import test from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment, NetworkSimulation, FactorySimulation, percentile, configOf, offeredLoad, recordsToCsv } from '../public/src/model.js';

test('Répétabilité et indépendance du découpage temporel',()=>{
  const ref=runExperiment({},60);
  assert.deepEqual(ref,runExperiment({},60));
  const sim=new NetworkSimulation({}, {keepRecords:false});
  for(let i=0;i<300;i++) sim.advance(200);
  assert.deepEqual(sim.drain(),ref.metrics);
});
test('Comptage des émissions et conservation des paquets après vidange',()=>{
  const r=runExperiment({},60);
  assert.equal(r.metrics.sent,36000);
  assert.equal(r.metrics.sent,r.metrics.delivered+r.metrics.dropped);
  assert.equal(r.metrics.delivered,r.metrics.late+r.metrics.onTime);
  assert.equal(r.metrics.pending,0);
  assert.equal(offeredLoad(configOf()),1.536);
});
test('Le cloud ne change que les délais prévus, pas les pertes radio nominales',()=>{
  const edge=runExperiment({profile:'edge'},2,true), cloud=runExperiment({profile:'cloud'},2,true);
  assert.equal(edge.metrics.dropped,cloud.metrics.dropped);
  for(let i=0;i<edge.records.length;i++) {
    if(edge.records[i].status!=='lost') assert.ok(cloud.records[i].latency>edge.records[i].latency);
  }
});
test('Une file saturée produit des rejets ; toutes les latences restent finies',()=>{
  const r=runExperiment({scenario:'congestion',devices:400},60,true);
  assert.ok(r.metrics.reasons.buffer>0);
  assert.ok(r.records.every(p=>p.latency===null || Number.isFinite(p.latency)&&p.latency>0));
});
test('Coupure : exactement 10 secondes sans livraison pour les émissions concernées',()=>{
  const r=runExperiment({scenario:'outage'},60,true);
  assert.equal(r.metrics.reasons.outage,6000);
  assert.ok(r.records.filter(p=>p.emitted>=20000&&p.emitted<30000).every(p=>p.reason==='outage'));
});
test('Les paquets encore en vol sont séparés des pertes',()=>{
  const sim=new NetworkSimulation({profile:'cloud'}); sim.advance(1);
  assert.equal(sim.metrics().sent,1); assert.equal(sim.metrics().pending,1);
  assert.equal(sim.metrics().dropped,0); sim.drain(); assert.equal(sim.metrics().delivered,1);
});
test('Quantile par rang supérieur et cas vide',()=>{
  assert.equal(percentile([],0.95),null); assert.equal(percentile([3,1,2,4],0.5),2);
  assert.equal(percentile([1,2,3,4],0.95),4);
});
test('TRS : identité Q*P*A et arrêt de production indépendant du réseau',()=>{
  const f=new FactorySimulation(); for(let i=0;i<50;i++) f.advance(200,'nominal');
  assert.equal(f.lines[1].total,9);
  for(let i=0;i<50;i++) f.advance(200,'nominal');
  f.toggle(0); const before=f.lines[0].total;
  for(let i=0;i<100;i++) f.advance(200,'outage');
  const m=f.metrics(); assert.equal(f.lines[0].total,before);
  assert.ok(Math.abs(m.availability-0.75)<1e-12);
  assert.ok(Math.abs(m.oee-m.good/m.planned)<1e-12);
});
test('Validation des entrées et schéma CSV',()=>{
  assert.throws(()=>configOf({devices:-1})); assert.throws(()=>configOf({profile:'unknown'}));
  assert.throws(()=>runExperiment({},0));
  const r=runExperiment({},1,true), csv=recordsToCsv(r.records);
  assert.equal(csv.trim().split('\n').length,601);
  assert.equal(csv.split('\n')[0].split(',').length,9);
});
