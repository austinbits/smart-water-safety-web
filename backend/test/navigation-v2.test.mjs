import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {alternatives,zoneForecast,elevationAt} from '../../shared/navigation.mjs';
const site=id=>JSON.parse(fs.readFileSync(new URL(`../../frontend/public/data/${id}.json`,import.meta.url)));
test('destination selection uses specific mapped points and real regional terrain',()=>{
 for(const id of ['calangute','muthathi']){const s=site(id),r=alternatives(s,s.planning_start);assert.ok(r.routes.length);for(const route of r.routes){assert.ok(route.destination_id);assert.ok(route.distance_m>0);}}
 const s=site('calangute');const a=alternatives(s,s.planning_start);const b=alternatives(s,s.planning_start,{destination:a.routes[0].destination_id});assert.equal(b.routes[0].destination_id,a.routes[0].destination_id);
 for(const id of ['calangute','muthathi','dudhsagar']){const dem=JSON.parse(fs.readFileSync(new URL(`../../frontend/public/data/elevation/${id}.json`,import.meta.url)));assert.equal(dem.points.length,1089);assert.ok(Number.isFinite(elevationAt(dem,site(id).center)));assert.equal(elevationAt(dem,[0,0]),null);}
});
test('spatial risk varies by area, site drivers and increasing time-dependent inputs',()=>{
 const s=site('muthathi');const rows=zoneForecast(s,{rainfall:24,upstream_rainfall:35},{rainfall:1,upstream_rainfall:2});assert.ok(rows.some(r=>r.rising));assert.ok(new Set(rows.map(r=>r.level)).size>1);
 const beach=zoneForecast(site('calangute'),{wave_height:2,flow_speed:.8,wind:40},{wave_height:.5,flow_speed:.1,wind:5});assert.ok(beach.some(r=>r.drivers.includes('Wave height')));assert.ok(!rows.some(r=>r.drivers.includes('Wave height')));
});
