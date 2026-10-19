import { AppError } from './http.js';
const BASE='https://generativelanguage.googleapis.com/v1beta/';
function apiError(status){
  const messages={400:'Gemini가 요청을 처리하지 못했습니다. API 키와 보고서 파일을 확인하세요.',401:'API 키가 유효하지 않습니다.',403:'API 키의 API 사용 권한 또는 지역 제한을 확인하세요. 서버 호출용 키에는 브라우저 HTTP referrer 제한을 사용할 수 없습니다.',404:'사용 가능한 Gemini 분석 모델을 찾지 못했습니다.',429:'Gemini 사용량 한도에 도달했습니다. Google AI Studio의 할당량을 확인하세요.'};
  return new AppError([400,401,403,404,429].includes(status)?status:502,`GEMINI_${status}`,messages[status]||'Gemini 서버 오류입니다. 잠시 후 다시 시도해 주세요.');
}
async function request(path,key,signal,body){
  return fetch(BASE+path,{method:body?'POST':'GET',signal,headers:{'x-goog-api-key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
export function rankModels(models){
  return models.filter(m=>/^models\/gemini-[a-z\d.-]+$/i.test(m.name)&&m.supportedGenerationMethods?.includes('generateContent')&&!/image|tts|audio|robotics|computer-use|embedding|live|research/i.test(m.name)).sort((a,b)=>{
    const rank=m=>(/preview|exp/.test(m.name)?0:1000)+(/flash/.test(m.name)?200:0)+(/lite/.test(m.name)?0:20)+parseFloat(m.name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1]||'0');return rank(b)-rank(a);
  }).map(m=>m.name);
}
export async function availableModels(key,signal){
  const models=[];const seen=new Set();let page='';
  for(let i=0;i<20;i++){
    const query=new URLSearchParams({pageSize:'1000'});if(page)query.set('pageToken',page);
    const response=await request('models?'+query,key,signal);if(!response.ok)throw apiError(response.status);
    const data=await response.json();models.push(...(data.models||[]));page=data.nextPageToken||'';
    if(!page)break;if(seen.has(page))throw new AppError(502,'MODEL_LIST','모델 목록을 읽지 못했습니다.');seen.add(page);
  }
  const ranked=rankModels(models);const preferred=process.env.GEMINI_MODEL?.replace(/^models\//,'');
  if(preferred&&ranked.includes('models/'+preferred))ranked.splice(0,0,...ranked.splice(ranked.indexOf('models/'+preferred),1));
  if(!ranked.length)throw apiError(404);return ranked;
}
export async function generate(key,payload,signal){
  const candidates=await availableModels(key,signal);
  for(const model of candidates.slice(0,4)){
    const response=await request(model+':generateContent',key,signal,payload);
    if(response.status===404)continue;
    if(!response.ok)throw apiError(response.status);
    const data=await response.json();const candidate=data.candidates?.[0];
    if(!candidate)throw new AppError(422,'NO_RESPONSE','Gemini가 분석 결과를 반환하지 않았습니다. 보고서 내용을 확인하세요.');
    if(candidate.finishReason&&candidate.finishReason!=='STOP')throw new AppError(422,'INCOMPLETE_RESPONSE','응답이 중단되었습니다. 보고서를 더 짧게 나누어 다시 시도해 주세요.');
    const text=candidate.content?.parts?.filter(p=>typeof p.text==='string'&&!p.thought).map(p=>p.text).join('');
    if(!text?.trim())throw new AppError(422,'EMPTY_RESPONSE','분석 응답이 비어 있습니다. 다시 시도해 주세요.');
    return text;
  }
  throw apiError(404);
}
