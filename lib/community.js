import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from './http.js';
import { validate } from './schema.js';
const COOKIE='report_studio_visitor';
const supabaseUrl=()=>process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
export function communityIssues(){
  const issues=[];
  if(!supabaseUrl())issues.push('SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL 미설정');
  else {try{if(new URL(supabaseUrl()).protocol!=='https:')throw Error()}catch{issues.push('Supabase URL 형식 오류')}}
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!key)issues.push('SUPABASE_SECRET_KEY 미설정');
  else if(key.startsWith('sb_publishable_'))issues.push('SUPABASE_SECRET_KEY에 공개용 키가 입력됨: 서버용 Secret key가 필요합니다');
  if(!(process.env.SESSION_SECRET||'').trim())issues.push('SESSION_SECRET 미설정');
  else if(process.env.SESSION_SECRET.trim().length<32)issues.push('SESSION_SECRET은 32자 이상이어야 합니다');
  return issues;
}
export function communityReady(){return communityIssues().length===0}
export function requireCommunity(){if(!communityReady())throw new AppError(503,'COMMUNITY_NOT_CONFIGURED','공개 평가 게시판을 준비 중입니다. 분석 기능은 계속 사용할 수 있습니다.');}
function signature(value){return createHmac('sha256',process.env.SESSION_SECRET).update(value).digest('base64url')}
function seal(payload){const value=Buffer.from(JSON.stringify(payload)).toString('base64url');return value+'.'+signature(value)}
function unseal(token,purpose){
  if(typeof token!=='string'||token.length>180000)throw new Error('invalid token');
  const [value,sig,...extra]=token.split('.');if(!value||!sig||extra.length)throw new Error('invalid token');
  const expected=Buffer.from(signature(value)),actual=Buffer.from(sig);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('signature');
  const payload=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  if(payload.purpose!==purpose||!Number.isFinite(payload.expires)||payload.expires<Date.now())throw new Error('expired');return payload;
}
export function actor(req,res,create=false){
  if(!communityReady())return null;
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(raw){try{const p=unseal(raw,'visitor');if(/^[a-f\d-]{36}$/.test(p.id))return p.id}catch{}}
  if(!create)return null;
  const id=randomUUID();const token=seal({purpose:'visitor',id,expires:Date.now()+365*86400000});
  const secure=Boolean(process.env.VERCEL)||req.headers['x-forwarded-proto']==='https';
  res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secure?'; Secure':''}`);return id;
}
export function evaluationOnly(input){
  if(!input||!Array.isArray(input.criteria))throw new AppError(400,'EVALUATION','평가 데이터가 올바르지 않습니다.');
  const evaluation={score:input.score,overview:input.overview,criteria:input.criteria.map(c=>({name:c.name,score:c.score,feedback:c.feedback})),strengths:input.strengths,improvements:input.improvements};
  try{validate({title:'',insight:'',corrections:[],evaluation,summary:{abstract:'',points:[],conclusion:''}})}catch{throw new AppError(400,'EVALUATION','평가 점수 또는 내용이 올바르지 않습니다.');}
  if(JSON.stringify(evaluation).length>50000||evaluation.strengths.length>30||evaluation.improvements.length>30)throw new AppError(400,'EVALUATION_SIZE','평가 내용이 너무 길어 공개 저장할 수 없습니다.');
  return evaluation;
}
export function issueShareProof(evaluation,owner){return seal({purpose:'evaluation',id:randomUUID(),owner,evaluation:evaluationOnly(evaluation),expires:Date.now()+86400000})}
export function readShareProof(token,owner){
  let payload;try{payload=unseal(token,'evaluation')}catch{throw new AppError(400,'INVALID_PROOF','공개 저장 가능 시간이 지났거나 평가가 변경되었습니다. 다시 분석해 주세요.');}
  if(payload.owner!==owner)throw new AppError(403,'PROOF_OWNER','평가를 생성한 브라우저에서 저장해 주세요.');
  return {id:payload.id,evaluation:evaluationOnly(payload.evaluation)};
}
export function uuid(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new AppError(400,'ID','올바른 게시물 번호가 아닙니다.');return value;}
export function displayName(value){if(typeof value!=='string'||!value.trim()||value.trim().length>40)throw new AppError(400,'NAME','이름은 1~40자로 입력하세요.');return value.trim();}
export function communityBody(req){
  if(req.method!=='POST')throw new AppError(405,'METHOD_NOT_ALLOWED','지원하지 않는 요청입니다.');
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new AppError(415,'CONTENT_TYPE','JSON 요청이 필요합니다.');
  if(req.headers['sec-fetch-site']==='cross-site')throw new AppError(403,'ORIGIN','다른 사이트에서 보낸 요청은 허용하지 않습니다.');
  if(req.headers.origin){let host;try{host=new URL(req.headers.origin).host}catch{}if(host!==req.headers.host)throw new AppError(403,'ORIGIN','요청 출처를 확인할 수 없습니다.');}
  let body=req.body;try{if(Buffer.isBuffer(body))body=body.toString('utf8');if(typeof body==='string'){if(Buffer.byteLength(body)>200000)throw new Error();body=JSON.parse(body);}}catch{throw new AppError(400,'BODY','요청 형식이나 크기가 올바르지 않습니다.');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>200000)throw new AppError(400,'BODY','요청 형식이나 크기가 올바르지 않습니다.');return body;
}
export async function db(path,{method='GET',body,prefer}={}){
  requireCommunity();const base=new URL(supabaseUrl());if(base.protocol!=='https:'||base.username||base.password)throw new AppError(503,'DB_CONFIG','게시판 연결 설정을 확인해 주세요.');
  const secret=process.env.SUPABASE_SECRET_KEY;
  let response;try{response=await fetch(new URL('/rest/v1/'+path,base),{method,headers:{apikey:secret,...(secret.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+secret}),'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},signal:AbortSignal.timeout(12000),...(body?{body:JSON.stringify(body)}:{})});}catch{throw new AppError(503,'DB_CONNECTION','게시판 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');}
  if(!response.ok){let data={};try{data=await response.json()}catch{}
    const message=String(data.message||'');
    if(message.includes('RATE_LIMIT'))throw new AppError(429,'RATE_LIMIT','너무 빠르게 등록하고 있습니다. 잠시 후 다시 시도하세요.');
    if(message.includes('SELF_FEEDBACK'))throw new AppError(400,'SELF_FEEDBACK','내가 공개한 평가에는 별점이나 댓글을 남길 수 없습니다.');
    if(message.includes('NOT_FOUND'))throw new AppError(404,'NOT_FOUND','게시물이 삭제되었거나 존재하지 않습니다.');
    if(message.includes('INVALID_INPUT'))throw new AppError(400,'INVALID_INPUT','입력 내용을 확인해 주세요.');
    throw new AppError(503,'DB_ERROR','게시판을 불러오지 못했습니다. 관리자에게 연결 설정 확인을 요청해 주세요.');
  }
  if(response.status===204)return null;return response.json();
}
