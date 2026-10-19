import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import handler from '../api/community.js';
import {actor,issueShareProof,readShareProof,evaluationOnly} from '../lib/community.js';
const evaluation={score:80,overview:'종합 평가',criteria:['내용','구성','논리','표현'].map(name=>({name,score:20,feedback:'설명'})),strengths:['강점'],improvements:['개선']};
function setup(t){const saved={...process.env};process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_TEST';process.env.SESSION_SECRET='test-secret'.repeat(8);t.after(()=>{for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY','SESSION_SECRET']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}});}
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=JSON.parse(v)}}}
function identity(){const res=response();const id=actor({headers:{}},res,true);return {id,cookie:res.headers['Set-Cookie'].split(';')[0]};}
async function invoke(body,{cookie='',method='POST',url='/api/community',headers={}}={}){const req={method,url,headers:{'content-type':'application/json',host:'localhost',cookie,...headers},body};const res=response();await handler(req,res);return res;}
const ok=data=>({ok:true,status:200,json:async()=>data});
test('evaluation projection and signed proof never include original, summary, filename or API key',t=>{
  setup(t);const owner=randomUUID();const extra={...evaluation,text:'PRIVATE ORIGINAL',summary:'PRIVATE SUMMARY',apiKey:'PRIVATE KEY',filename:'PRIVATE FILE'};
  assert.deepEqual(evaluationOnly(extra),evaluation);const proof=issueShareProof(extra,owner);const content=Buffer.from(proof.split('.')[0],'base64url').toString();assert(!content.includes('PRIVATE'));assert.deepEqual(readShareProof(proof,owner).evaluation,evaluation);
  assert.throws(()=>readShareProof(proof,randomUUID()));assert.throws(()=>readShareProof(proof.slice(0,-1)+'!',owner));
});
test('publish requires signed session, explicit consent and sends evaluation-only columns',async t=>{
  setup(t);const who=identity(),proof=issueShareProof(evaluation,who.id);const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return ok(randomUUID())});
  const res=await invoke({action:'publish',proof,name:'홍길동',consent:true,report:'PRIVATE ORIGINAL',summary:'PRIVATE SUMMARY',apiKey:'PRIVATE KEY'},{cookie:who.cookie});
  assert.equal(res.statusCode,201);assert.deepEqual(Object.keys(calls[0].body).sort(),['p_evaluation','p_id','p_name','p_owner']);assert(!JSON.stringify(calls).includes('PRIVATE'));
  assert.equal((await invoke({action:'publish',proof,name:'이름',consent:false},{cookie:who.cookie})).statusCode,400);
  assert.equal((await invoke({action:'publish',proof,name:'이름',consent:true},{cookie:identity().cookie})).statusCode,403);
});
test('public list hides ownership ids and paginates',async t=>{
  setup(t);const who=identity();t.mock.method(globalThis,'fetch',async()=>ok(Array.from({length:13},()=>({id:randomUUID(),owner_id:who.id,author_name:'이름',evaluation}))));
  const res=await invoke(null,{method:'GET',url:'/api/community?page=1',cookie:who.cookie});assert.equal(res.body.reviews.length,12);assert.equal(res.body.hasMore,true);assert.equal(res.body.reviews[0].is_mine,true);assert(!JSON.stringify(res.body).includes('owner_id'));
});
test('star-only and comment-only feedback accepted; empty, invalid stars and long comments rejected',async t=>{
  setup(t);const who=identity();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return ok(null)});
  const base={action:'feedback',reviewId:randomUUID(),name:'방문자'};
  assert.equal((await invoke({...base,rating:5,comment:''},{cookie:who.cookie})).statusCode,200);
  assert.equal((await invoke({...base,rating:null,comment:'평가가 도움이 됩니다.'},{cookie:who.cookie})).statusCode,200);
  for(const bad of [{rating:0,comment:''},{rating:6,comment:''},{rating:1.5,comment:''},{rating:null,comment:''},{rating:5,comment:'a'.repeat(1001)}])assert.equal((await invoke({...base,...bad},{cookie:who.cookie})).statusCode,400);
  assert.equal(calls,2);
});
test('deletions always scope to signed owner and do not accept client owner ids',async t=>{
  setup(t);const who=identity(),other=randomUUID();let query;
  t.mock.method(globalThis,'fetch',async(url)=>{query=new URL(url);return ok([])});
  const res=await invoke({action:'delete-review',id:randomUUID(),owner:other},{cookie:who.cookie});assert.equal(res.statusCode,403);assert.equal(query.searchParams.get('owner_id'),'eq.'+who.id);assert(!query.href.includes(other));
});
test('database limits and self-rating errors are surfaced without secrets',async t=>{
  setup(t);const who=identity();let message='RATE_LIMIT';t.mock.method(globalThis,'fetch',async()=>({ok:false,status:400,json:async()=>({message})}));
  const body={action:'feedback',reviewId:randomUUID(),name:'이름',rating:5,comment:''};assert.equal((await invoke(body,{cookie:who.cookie})).statusCode,429);message='SELF_FEEDBACK';assert.equal((await invoke(body,{cookie:who.cookie})).statusCode,400);
  message='database failed secret sb_secret_TEST';const res=await invoke(body,{cookie:who.cookie});assert.equal(res.statusCode,503);assert(!JSON.stringify(res.body).includes('sb_secret_TEST'));
});
test('unconfigured board degrades gracefully and cross-site writes are blocked',async t=>{
  setup(t);t.mock.method(globalThis,'fetch',()=>assert.fail('must not reach database'));
  const res=await invoke({action:'feedback'},{headers:{origin:'https://evil.example'}});assert.equal(res.statusCode,403);
  delete process.env.SUPABASE_SECRET_KEY;assert.equal((await invoke(null,{method:'GET'})).body.configured,false);assert.equal((await invoke({action:'publish'})).statusCode,503);
});
