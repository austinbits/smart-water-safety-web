import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {createServer}=require('../src/app');
test('independent tourist/admin sessions share SOS lifecycle while enforcing privacy and ownership',async()=>{
 const {server,io}=await createServer({memory:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 async function request(path,key,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(key?{'X-Workspace-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 const action=(key,a,p,eventId=randomUUID())=>request('/workspace/action',key,{action:a,payload:p,eventId});
 try{
  const admin=(await request('/workspace/demo',null,{role:'admin',name:'Coordinator'})).data;
  const tourist=(await request('/workspace/demo',null,{role:'tourist',name:'Maya',age:23,code:admin.user.code})).data;
  const other=(await request('/workspace/demo',null,{role:'tourist',name:'Dev',age:31,code:admin.user.code})).data;
  assert.notEqual(admin.key,tourist.key);
  assert.equal((await request('/workspace/replay/calangute',tourist.key)).status,403);
  assert.equal((await request('/datasets/calangute_sos_events_dummy.json',tourist.key)).status,403);
  assert.equal((await request('/sites/calangute')).data.replay.length,0);
  assert.equal((await action(tourist.key,'position',{site:'calangute',lng:73.76,lat:15.54,consent:false})).status,400);
  await action(tourist.key,'position',{site:'calangute',lng:73.76,lat:15.54,consent:true});
  const id=randomUUID(),payload={site:'calangute',lng:73.76,lat:15.54,zone:'medium',note:'Need help'};
  await Promise.all([action(tourist.key,'sos',payload,id),action(tourist.key,'sos',payload,id)]);
  let s=(await request('/workspace/state',admin.key)).data.state;
  assert.equal(s.incidents.length,1);assert.equal(s.incidents[0].name,'Maya');assert.equal(s.visitors[0].age,23);
  assert.equal((await request('/workspace/state',other.key)).data.state.incidents.length,0);
  assert.equal((await action(other.key,'cancel',{id})).status,403);
  assert.equal((await action(tourist.key,'assign',{id,team_id:'calangute-alpha'})).status,403);
  assert.equal((await action(admin.key,'assign',{id,team_id:'muthathi-bravo'})).status,400);
  assert.equal((await action(admin.key,'resolve',{id})).status,400);
  await action(admin.key,'assign',{id,team_id:'calangute-alpha'});
  s=(await request('/workspace/state',tourist.key)).data.state;
  assert.equal(s.incidents[0].status,'dispatched');assert.equal(s.teams.length,1);assert.equal(s.visitors.length,0);assert.equal(s.audit.length,0);
  await action(admin.key,'team_position',{team_id:'calangute-alpha',site:'calangute',lng:73.761,lat:15.541});
  s=(await request('/workspace/state',tourist.key)).data.state;assert.equal(s.teams[0].lng,73.761);assert.ok(s.teams[0].eta_min>0);
  await action(admin.key,'arrive',{team_id:'calangute-alpha'});await action(admin.key,'resolve',{id});
  s=(await request('/workspace/state',tourist.key)).data.state;assert.equal(s.incidents[0].status,'resolved');assert.equal(s.teams.length,0);
  const outsider=(await request('/workspace/demo',null,{role:'admin',name:'Other drill'})).data;
  assert.equal((await request('/workspace/state',outsider.key)).data.state.incidents.length,0);
 }finally{io.close();await new Promise(r=>server.close(r));}
});
