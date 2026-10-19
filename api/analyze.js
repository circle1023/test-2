import { parseRequest,send,errorResponse } from '../lib/http.js';
import { generate } from '../lib/gemini.js';
import { makeReviewRequest,parseReview } from '../lib/review.js';
import { communityIssues,communityReady,actor,issueShareProof } from '../lib/community.js';
export default async function handler(req,res){
  try{const body=parseRequest(req);const payload=makeReviewRequest(body);const text=await generate(body.apiKey,payload,AbortSignal.timeout(110000));const result=parseReview(text);let shareProof=null;let shareError=communityIssues().join(" / ");
    if(communityReady()){try{shareProof=issueShareProof(result.evaluation,actor(req,res,true))}catch{shareError='공개 저장 권한 생성에 실패했습니다. 새로고침 후 다시 분석해 주세요.'}}
    send(res,200,{result,shareProof,shareError});}catch(error){errorResponse(res,error);}
}
