import test from 'node:test';
import assert from 'node:assert/strict';
import analyze from '../api/analyze.js';
import connection from '../api/connection.js';
import {makeReviewRequest,parseReview} from '../lib/review.js';
import {rankModels} from '../lib/gemini.js';
const apiKey='test-secret-key';
const valid={title:'검토',insight:'핵심',corrections:[],evaluation:{score:80,overview:'평가',criteria:['내용','구성','논리','표현'].map(name=>({name,score:20,feedback:'설명'})),strengths:['강점'],improvements:['개선']},summary:{abstract:'요약',points:['핵심'],conclusion:'결론'}};
function response(status,data){return {ok:status>=200&&status<300,status,json:async()=>data}}
const catalog={models:[{name:'models/gemini-3.0-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]};
const generated=text=>response(200,{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]});
async function invoke(handler,body,options={}){const req={method:'POST',headers:{'content-type':'application/json'},body,...options};const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},end(value){this.body=JSON.parse(value)}};await handler(req,res);return res;}
test('successful review uses server prompt, header-only key and returns validated data',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url:String(url),options});return String(url).includes('/models?')?response(200,catalog):generated(JSON.stringify(valid));});
  const res=await invoke(analyze,{apiKey,text:'테스트 보고서',criteria:'근거 평가',systemInstruction:'override'});
  assert.equal(res.statusCode,200);assert.deepEqual(res.body.result,valid);assert.equal(res.headers['Cache-Control'],'no-store');
  assert(!calls.some(c=>c.url.includes(apiKey)));assert.equal(calls[1].options.headers['x-goog-api-key'],apiKey);
  assert.match(JSON.parse(calls[1].options.body).systemInstruction.parts[0].text,/한국어 보고서 검토자/);assert(!JSON.stringify(res.body).includes(apiKey));
});
test('404 retries next model, 429 stops without repeated generation',async t=>{
  let posts=0;t.mock.method(globalThis,'fetch',async(url)=>{if(String(url).includes('/models?'))return response(200,catalog);posts++;return posts===1?response(404,{}):generated(JSON.stringify(valid));});
  assert.equal((await invoke(analyze,{apiKey,text:'본문'})).statusCode,200);assert.equal(posts,2);
  t.mock.restoreAll();posts=0;t.mock.method(globalThis,'fetch',async(url)=>{if(String(url).includes('/models?'))return response(200,catalog);posts++;return response(429,{error:{message:apiKey}})});
  const limited=await invoke(analyze,{apiKey,text:'본문'});assert.equal(limited.statusCode,429);assert.equal(posts,1);assert(!JSON.stringify(limited.body).includes(apiKey));
});
test('bad methods, keys, bodies and cross-site requests fail before upstream call',async t=>{
  t.mock.method(globalThis,'fetch',()=>{assert.fail('upstream should not be called')});
  assert.equal((await invoke(analyze,{}, {method:'GET'})).statusCode,405);
  assert.equal((await invoke(analyze,{apiKey:'',text:'본문'})).statusCode,400);
  assert.equal((await invoke(analyze,{apiKey,text:'a'.repeat(120001)})).statusCode,400);
  assert.equal((await invoke(analyze,{apiKey,text:'본문',criteria:'a'.repeat(2001)})).statusCode,400);
  assert.equal((await invoke(analyze,'{bad json')).statusCode,400);
  assert.equal((await invoke(analyze,{apiKey,text:'본문'},{headers:{'content-type':'application/json','sec-fetch-site':'cross-site'}})).statusCode,403);
  assert.equal((await invoke(analyze,{apiKey,text:'본문'},{headers:{'content-type':'text/plain'}})).statusCode,415);
});
test('PDF signature, encoding and size boundaries',()=>{
  const good=Buffer.from('%PDF-1.7\ntest').toString('base64');assert.equal(makeReviewRequest({pdf:good}).contents[0].parts[1].inlineData.mimeType,'application/pdf');
  assert.throws(()=>makeReviewRequest({pdf:Buffer.from('not pdf').toString('base64')}));
  assert.throws(()=>makeReviewRequest({pdf:'!@#'}));assert.throws(()=>makeReviewRequest({pdf:good,text:'duplicate'}));
  assert.throws(()=>makeReviewRequest({pdf:'A'.repeat(4_000_004)}));
});
test('malformed result and wrong score total are rejected',async t=>{
  const wrong=structuredClone(valid);wrong.evaluation.score=81;assert.throws(()=>parseReview(JSON.stringify(wrong)));assert.throws(()=>parseReview('not json'));
  t.mock.method(globalThis,'fetch',async(url)=>String(url).includes('/models?')?response(200,catalog):generated(JSON.stringify(wrong)));
  const res=await invoke(analyze,{apiKey,text:'본문'});assert.equal(res.statusCode,502);assert.equal(res.body.error.code,'INVALID_RESULT');
});
test('connection checks generated response and classifies timeouts',async t=>{
  t.mock.method(globalThis,'fetch',async(url)=>String(url).includes('/models?')?response(200,catalog):generated('OK'));
  assert.equal((await invoke(connection,{apiKey})).statusCode,200);
  t.mock.restoreAll();t.mock.method(globalThis,'fetch',()=>{throw new DOMException('timeout','TimeoutError')});assert.equal((await invoke(connection,{apiKey})).statusCode,504);
});
test('model ranking excludes specialist and unsupported models',()=>{
  const models=[...catalog.models,{name:'models/gemini-4-flash-image',supportedGenerationMethods:['generateContent']},{name:'models/gemini-4-flash',supportedGenerationMethods:['countTokens']}];
  assert.deepEqual(rankModels(models),['models/gemini-3.0-flash','models/gemini-2.5-flash']);
});
