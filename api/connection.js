import { parseRequest,send,errorResponse } from '../lib/http.js';
import { generate } from '../lib/gemini.js';
export default async function handler(req,res){
  try{const body=parseRequest(req);await generate(body.apiKey,{contents:[{parts:[{text:'Reply with OK only.'}]}],generationConfig:{maxOutputTokens:1024}},AbortSignal.timeout(45000));send(res,200,{message:'Gemini 실제 응답을 확인했습니다. 보고서를 분석할 수 있습니다.'});}catch(error){errorResponse(res,error);}
}
