const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(source,'research/math/archive/problems.json')));
const choose=(n,k)=>{let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return v;};
function* combos(a,k,p=[]){if(!k){yield p;return;}for(let i=0;i<=a.length-k;i++)yield* combos(a.slice(i+1),k-1,[...p,a[i]]);}
function* perms(a,p=[]){if(!a.length){yield p;return;}for(let i=0;i<a.length;i++)yield* perms([...a.slice(0,i),...a.slice(i+1)],[...p,a[i]]);}
const range=n=>Array.from({length:n},(_,i)=>i+1),sum=a=>a.reduce((s,x)=>s+x,0);
let fact=1n,total=0n;for(let n=1n;n<=2025n;n++){fact*=n;total+=fact;}
const divisors=n=>range(n).filter(x=>n%x===0).length;
let minimum=12;while(divisors(minimum)!==18)minimum+=12;
const probability=[...combos(range(10),2)].filter(([a,b])=>a*b%2===0).length;
let units=2;for(let i=1;i<2026;i++)units=(3*units+1)%10;
const quadratic=[];for(let m=1;m<=200;m++)for(let r=1;r<=2*m;r++){const s=2*m/r;if(Number.isInteger(s)&&r+s===m+3){quadratic.push(m);break;}}
const reverse=range(90).map(x=>x+9).filter(n=>{const a=Math.floor(n/10),b=n%10;return 10*b+a-n===27&&a*b===18;});
const minN=range(1000).find(n=>[2,3,4,5].every(d=>n%d===d-1)&&n%7===0);
let a20=1;for(let i=1;i<20;i++)a20+=i;
const dp=Array.from({length:5},()=>Array(5).fill(0));for(let x=0;x<=4;x++)for(let y=0;y<=4;y++){if(x===2&&y===2)continue;dp[x][y]=x===0&&y===0?1:(x?dp[x-1][y]:0)+(y?dp[x][y-1]:0);}
const expected={'skku-m1-01':String(range(30).find(n=>n*(n+1)*(n+2)===1320)),'skku-m1-02':String(choose(6,2)*choose(5,2)),'skku-m1-03':'9/10','skku-m2-01':String(total%1000n),'skku-m2-02':String(minimum),'skku-m2-03':`${probability/5}/9`,'skku-m3-01':String(quadratic[0]),'skku-m3-02':String(units),'skku-m3-03':String((17**2-13**2)/4),'bull-01':String(minN),'bull-02':String(reverse[0]),'bull-03':String(a20),'bull-04':String(dp[4][4]),'bull-05':String([...combos(range(9),3)].filter(a=>sum(a)===15).length)};
assert.equal(new Set(data.problems.map(p=>p.id)).size,14);assert.deepEqual(quadratic,[2]);assert.deepEqual(reverse,[36]);assert.ok(Math.abs(sum(range(9).map(n=>1/(n*(n+1))))-.9)<1e-12);
const archive=data.problems.map(p=>{assert.equal(p.answer,expected[p.id],p.id);return {id:p.id,publishedAnswer:p.answer,calculatedAnswer:expected[p.id],status:'match'};});
// Convex hull enumerates strict vertices, excluding collinear boundary points.
const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
function hull(a){const pts=[...a].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lo=[],hi=[];for(const p of pts){while(lo.length>=2&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}for(const p of pts.slice().reverse()){while(hi.length>=2&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}return lo.slice(0,-1).concat(hi.slice(0,-1));}
const strings=[];for(let n=0;n<81;n++){const a=n.toString(3).padStart(4,'0');if(new Set(a).size===3&&[...a].every((v,i)=>i===0||v!==a[i-1]))strings.push(a);}
const orbits=new Set;for(let n=0;n<16;n++){const a=n.toString(2).padStart(4,'0');orbits.add([0,1,2,3].map(i=>a.slice(i)+a.slice(0,i)).sort()[0]);}
const grid=[];for(let x=0;x<3;x++)for(let y=0;y<3;y++)grid.push([x,y]);
const stairs=[1,1];for(let n=2;n<=8;n++)stairs[n]=stairs[n-1]+stairs[n-2];
const kmo={1:strings.length,2:[...combos(range(6),3)].filter(a=>a.reduce((p,x)=>p*x,1)%12===0).length,3:orbits.size,4:[...combos(grid,5)].filter(a=>hull(a).length===5).length,5:'P(0,0)=1; P(x,y)=0 for x<0 or y<0; P(x,y)=P(x-1,y)+P(x,y-1)+P(x-1,y-1)',6:[...perms(range(6))].filter(a=>Math.abs(a.indexOf(1)-a.indexOf(2))!==1).length,7:[...combos(range(8),4)].filter(a=>a.some(x=>x%2===0)).length,8:[...combos(range(9),3)].filter(a=>new Set(a.map(x=>x%3)).size===3).length,9:stairs[8],10:[...combos(range(10),3)].filter(a=>sum(a)%2===0&&a.some(x=>x%3===0)).length};
const f=x=>x*x*(x-3)/4;assert.equal(f(6),27);assert.equal(f(2),-1);assert.ok(f(0)===0);assert.equal(f(3),0);
const result={checkedAt:new Date().toISOString(),method:'Exact BigInt factorial sum through 2025; bounded exhaustive enumeration; combinatorial counts; algebraic identities. Internal calculations do not establish official exam provenance.',archive,kmo,individual:{factorial:expected['skku-m2-01'],remainder:expected['bull-01'],juneReconstructedConditions:{roots:[0,0,3],coefficient:'1/4',minimum:-1,f6:27,officialQuestionRecomparison:'pending_source_404'}}};
console.log(JSON.stringify(result,null,2));
