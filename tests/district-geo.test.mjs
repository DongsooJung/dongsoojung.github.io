import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDistrict,districtForCode,decodeRing} from '../cloudflare/district-geo.mjs';
import geometry from '../assets/korea-district-boundaries.json' with {type:'json'};
test('current boundaries resolve IP estimates, reject missing positions, and do not guess across the sea',()=>{
 assert.equal(geometry.version,'2026-10-01');assert.equal(new Set(geometry.districts.map(d=>d.code)).size,geometry.districts.length);
 assert.equal(resolveDistrict({country:'KR',latitude:'37.5172',longitude:'127.0473'}).code,'11680');
 for(const geo of [{country:'US',latitude:37.5172,longitude:127.0473},{country:'KR',city:'Seoul'},{country:'KR',latitude:'',longitude:''},{country:'KR',latitude:0,longitude:127},{country:'KR',latitude:35,longitude:124}])assert.equal(resolveDistrict(geo),null);
 assert.equal(resolveDistrict({country:'KR',district_code:'11680'}).name,'강남구');assert.equal(districtForCode('99999'),null);
 const d=geometry.districts.find(d=>d.code==='11680');const ring=decodeRing(d.rings[0][0]);assert.ok(ring.length>3);assert.deepEqual(ring[0],ring.at(-1));
 for(const [x,y] of ring){assert.ok(x>=d.bbox[0]-.00001&&x<=d.bbox[2]+.00001);assert.ok(y>=d.bbox[1]-.00001&&y<=d.bbox[3]+.00001);}
});
