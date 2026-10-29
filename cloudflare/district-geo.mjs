// Boundary source/license: ../assets/korea-district-boundaries-LICENSE.txt.
// Input coordinates are Cloudflare's IP estimates, processed transiently only.
import boundary from '../assets/korea-district-boundaries.json' with {type:'json'};
export const DISTRICT_BOUNDARY_VERSION = boundary.version;
export function decodeRing(encoded) {
  let cursor=0,x=0,y=0;
  const points=[];
  function read(){let value=0,shift=0,chunk;do{if(cursor>=encoded.length||shift>30)throw new Error('Invalid boundary encoding');chunk=encoded.charCodeAt(cursor++)-63;value|=(chunk&31)<<shift;shift+=5;}while(chunk>=32);return value&1?~(value>>>1):value>>>1;}
  while(cursor<encoded.length){x+=read();y+=read();points.push([x/1e5,y/1e5]);}
  return points;
}
const districts=boundary.districts.map(d=>({...d,polygons:d.rings.map(poly=>poly.map(decodeRing))}));
const byCode=new Map(districts.map(d=>[d.code,d]));
export function districtForCode(code){const d=byCode.get(code);return d?{code:d.code,name:d.name,province_code:d.province_code,province_name:d.province_name}:null;}
function inRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [a,b]=ring[i],[c,d]=ring[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}return inside;}
function number(value){if(typeof value!=='number'&&typeof value!=='string')return null;if(typeof value==='string'&&!value.trim())return null;const n=Number(value);return Number.isFinite(n)?n:null;}
export function resolveDistrict(geo){
  if(geo?.country!=='KR')return null;
  // Internal, server-resolved code survives the Worker -> Durable Object hop.
  if(geo.latitude===undefined&&geo.longitude===undefined&&geo.district_code)return districtForCode(geo.district_code);
  const x=number(geo.longitude),y=number(geo.latitude);
  if(x===null||y===null||x<124||x>133||y<32||y>40)return null;
  const matches=[];
  for(const d of districts){const [minX,minY,maxX,maxY]=d.bbox;if(x<minX||x>maxX||y<minY||y>maxY)continue;
    if(d.polygons.some(poly=>inRing(x,y,poly[0])&&!poly.slice(1).some(hole=>inRing(x,y,hole))))matches.push(d);
  }
  // Do not guess a nearest district for gaps, sea locations, or overlaps.
  return matches.length===1?districtForCode(matches[0].code):null;
}
