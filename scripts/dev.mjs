import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import analyze from '../api/analyze.js';
import connection from '../api/connection.js';
import {MAX_BODY_BYTES,send} from '../lib/http.js';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      const handler={'/api/analyze':analyze,'/api/connection':connection}[url.pathname];
      if(!handler)return send(res,404,{error:{message:'API를 찾지 못했습니다.'}});
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY_BYTES){send(res,413,{error:{message:'요청 용량이 너무 큽니다.'}});return}chunks.push(chunk)}
      req.body=Buffer.concat(chunks).toString('utf8');return await handler(req,res);
    }
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!target.startsWith(root+path.sep)&&target!==path.join(root,'index.html')){res.writeHead(403);return res.end();}
    const data=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log(`Report Studio: http://localhost:${server.address().port}`));
