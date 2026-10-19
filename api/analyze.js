import { parseRequest,send,errorResponse } from '../lib/http.js';
import { generate } from '../lib/gemini.js';
import { makeReviewRequest,parseReview } from '../lib/review.js';
export default async function handler(req,res){
  try{const body=parseRequest(req);const payload=makeReviewRequest(body);const text=await generate(body.apiKey,payload,AbortSignal.timeout(110000));send(res,200,{result:parseReview(text)});}catch(error){errorResponse(res,error);}
}
