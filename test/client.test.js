import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('client starts in script order, posts to own API and displays server error',async()=>{
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},focus(){},scrollIntoView(){}});return elements.get(id)};
  const requests=[];const context=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[]},window:{addEventListener(){}},navigator:{},AbortController,DOMException,setTimeout,clearTimeout,Blob,URL,TextDecoder,fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:false,status:429,json:async()=>({error:{message:'사용량 초과 테스트'}})}}});
  const root=new URL('../public/',import.meta.url);
  vm.runInContext(await readFile(new URL('results.js',root),'utf8'),context);
  vm.runInContext(await readFile(new URL('app.js',root),'utf8'),context);
  get('key').value='test-key';get('text').value='테스트 보고서';await vm.runInContext('analyze()',context);
  assert.equal(requests[0].url,'/api/analyze');assert.equal(requests[0].body.text,'테스트 보고서');assert.equal(get('status').textContent,'사용량 초과 테스트');assert.equal(get('analyze').disabled,false);
});
