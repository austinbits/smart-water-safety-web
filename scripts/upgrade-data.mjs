import fs from 'node:fs';
const starts={calangute:null,muthathi:[77.276711,12.3119091],dudhsagar:[74.3130529554,15.3092691626]};
for(const id of ['calangute','muthathi','dudhsagar']){
 const privatePath=`data/normalized/${id}.json`,publicPath=`frontend/public/data/${id}.json`;
 const s=JSON.parse(fs.readFileSync(privatePath));
 s.planning_start=starts[id]||s.features.features.find(f=>f.properties.category==='route').geometry.coordinates[0].slice(0,2);
 s.default_destination=id==='dudhsagar'?'dudhsagar-kml-8':null;
 if(id==='dudhsagar')for(const f of s.features.features){if(f.properties.id==='HZ-02'){Object.assign(f.properties,{category:'catchment',original_category:'hazard',original_level:'high',level:'unknown',interpretation:'Broad catchment reference, not an observed inundation extent. Retained separately from specific water hazards.'});}}
 s.timeline=s.timeline.map((r,i)=>({...r,simulation_metrics:{water_level:r.water_level??Number((.8+.15*Math.sin(i/7)+Math.min((r.rainfall||0)/100,.6)).toFixed(2)),flow_speed:r.flow_speed??Number((.35+.12*Math.sin(i/9)+Math.min((r.rainfall||0)/80,.8)).toFixed(2)),temperature:r.temperature??Number((27+3*Math.sin((i%24)/24*Math.PI*2)).toFixed(1))},simulation_method:'Illustrative bounded periodic series with rainfall response; no gauge calibration. Never a substitute for a local observation.'}));
 s.upgrade_notes=['Original KML bytes preserved. Destination routing uses mapped pedestrian geometry.','Real regional terrain in /data/elevation; regional resolution cannot establish trail safety.','Missing metrics have separate simulation values; observed fields stay null.'];
 fs.writeFileSync(privatePath,JSON.stringify(s));fs.writeFileSync(publicPath,JSON.stringify({...s,replay:[]}));
 console.log(id,'updated',s.timeline.length,'samples; private replay',s.replay.length);
}
