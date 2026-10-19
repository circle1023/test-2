export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export const MAX_BODY_BYTES=4_200_000;
export function send(res,status,data){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=status;res.end(JSON.stringify(data));}
export function parseRequest(req){
  if(req.method!=='POST')throw new AppError(405,'METHOD_NOT_ALLOWED','POST 요청만 지원합니다.');
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new AppError(415,'CONTENT_TYPE','JSON 요청이 필요합니다.');
  // Reject cross-site browser calls. Users supply their own API key; no shared paid credential exists.
  if(req.headers['sec-fetch-site']==='cross-site')throw new AppError(403,'ORIGIN','다른 사이트에서 보낸 요청은 허용하지 않습니다.');
  if(Number(req.headers['content-length'])>MAX_BODY_BYTES)throw new AppError(413,'PAYLOAD_TOO_LARGE','파일이 너무 큽니다. PDF는 3MB 이하로 줄여 주세요.');
  let body=req.body;
  try{if(Buffer.isBuffer(body))body=body.toString('utf8');if(typeof body==='string'){if(Buffer.byteLength(body)>MAX_BODY_BYTES)throw new AppError(413,'PAYLOAD_TOO_LARGE','요청 용량이 너무 큽니다.');body=JSON.parse(body);}}
  catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'INVALID_JSON','요청 형식이 올바르지 않습니다.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError(400,'INVALID_BODY','요청 내용이 없습니다.');
  if(Buffer.byteLength(JSON.stringify(body))>MAX_BODY_BYTES)throw new AppError(413,'PAYLOAD_TOO_LARGE','요청 용량이 너무 큽니다.');
  if(typeof body.apiKey!=='string'||!body.apiKey.trim()||body.apiKey.length>512||/[\r\n]/.test(body.apiKey))throw new AppError(400,'API_KEY_REQUIRED','Gemini API 키를 입력해 주세요.');
  return {...body,apiKey:body.apiKey.trim()};
}
export function errorResponse(res,error){
  if(error.name==='TimeoutError'||error.name==='AbortError')return send(res,504,{error:{code:'TIMEOUT',message:'분석 시간이 초과되었습니다. 보고서를 더 짧게 나누어 다시 시도해 주세요.'}});
  const known=error instanceof AppError;
  if(known&&error.status===405)res.setHeader('Allow','POST');
  send(res,known?error.status:502,{error:{code:known?error.code:'UPSTREAM_CONNECTION',message:known?error.message:'분석 서버가 Gemini에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'}});
}
