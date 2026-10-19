import { parseRequest,send,errorResponse } from '../lib/http.js';
import { generate } from '../lib/gemini.js';
import { makeReviewRequest,parseReview } from '../lib/review.js';
import { communityReady,actor,issueShareProof } from '../lib/community.js';
export default async function handler(req,res){
  try{const body=parseRequest(req);const payload=makeReviewRequest(body);const text=await generate(body.apiKey,payload,AbortSignal.timeout(110000));const result=parseReview(text);let shareProof=null;
    if(communityReady()){try{shareProof=issueShareProof(result.evaluation,actor(req,res,true))}catch{/* Sharing must not discard a completed analysis. */}}
    send(res,200,{result,shareProof});}catch(error){errorResponse(res,error);}
}
