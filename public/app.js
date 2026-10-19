const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected=null,result=null,busy=false,controller=null;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error)}
function lock(value){busy=value;for(const id of ['analyze','clear','file','text','criteria','test-connection','key'])$(id).disabled=value;$('drop').setAttribute('aria-disabled',String(value));$('cancel').hidden=!value;}
async function callApi(endpoint,payload,signal){
  let response;try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal,cache:'no-store'});}catch(error){if(error.name==='AbortError')throw error;throw new Error('분석 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.');}
  let data;try{data=await response.json()}catch{throw new Error(response.status===413?'전송 용량이 너무 큽니다. PDF는 3MB 이하로 줄여 주세요.':response.status===504?'서버 처리 시간이 초과되었습니다. 보고서를 나누어 분석하세요.':'서버 응답을 읽지 못했습니다. 잠시 후 다시 시도하세요.');}
  if(!response.ok)throw new Error(data.error?.message||'요청 처리에 실패했습니다.');return data;
}
function choose(file){
  if(busy||!file)return;
  const ext=file.name.split('.').pop().toLowerCase();if(!['pdf','docx','txt','md'].includes(ext)){status('PDF, DOCX, TXT, MD 파일을 선택해 주세요.',true);return}
  const limit=ext==='pdf'?3_000_000:10_000_000;
  if(!file.size||file.size>limit){status(`파일은 0바이트보다 크고 ${ext==='pdf'?'3':'10'}MB 이하여야 합니다.`,true);return}
  window.reviewCommunity?.clear();selected=file;result=null;$('results').hidden=true;$('text').value='';$('count').textContent='0자';$('filename').textContent=file.name;$('fileinfo').textContent=(file.size/1000).toFixed(1)+' KB · 분석 준비 완료';
  if($('key').value.trim())analyze();else status('상단에 API 키를 입력한 뒤 분석 시작을 눌러 주세요.');
}
async function readReport(){
  const text=$('text').value.trim();if(text)return {text};if(!selected)throw new Error('파일을 선택하거나 본문을 입력하세요.');
  const ext=selected.name.split('.').pop().toLowerCase();
  if(ext==='pdf')return {pdf:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다.'));reader.readAsDataURL(selected)})};
  const bytes=await selected.arrayBuffer();let extracted;
  if(ext==='docx'){if(!window.mammoth)throw new Error('DOCX 읽기 기능을 불러오지 못했습니다. 새로고침하거나 본문을 직접 붙여 넣으세요.');extracted=(await mammoth.extractRawText({arrayBuffer:bytes})).value;}
  else{extracted=new TextDecoder('utf-8').decode(bytes);if(extracted.includes('\ufffd'))extracted=new TextDecoder('euc-kr').decode(bytes);}
  if(!extracted.trim())throw new Error('파일에서 본문을 찾지 못했습니다.');return {text:extracted};
}
async function analyze(){
  if(busy)return;const apiKey=$('key').value.trim();if(!apiKey){status('Gemini API 키를 입력하세요.',true);$('key').focus();return}
  const criteria=$('criteria').value.trim();if(criteria.length>2000){status('추가 기준은 2,000자 이하로 입력하세요.',true);return}
  lock(true);controller=new AbortController();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller?.abort()},115000);$('analyze').textContent='분석 중…';$('results').hidden=true;status('보고서를 읽고 있습니다…');
  try{
    const report=await readReport();if(report.text?.length>120000)throw new Error('본문은 120,000자 이하로 나누어 분석하세요.');if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    status('Gemini가 맞춤법, 평가, 요약을 분석하고 있습니다…');const data=await callApi('/api/analyze',{apiKey,criteria,...report},controller.signal);result=data.result;render();window.reviewCommunity?.completed(data);status('분석이 완료되었습니다. 교정 제안과 평가를 확인하세요.');$('results').scrollIntoView({behavior:'smooth'});
  }catch(error){status(error.name==='AbortError'?(timedOut?'분석 시간이 초과되었습니다. 보고서를 나누어 다시 시도하세요.':'분석 대기를 취소했습니다. 이미 시작된 서버 작업은 잠시 계속될 수 있습니다.'):error.message,true)}
  finally{clearTimeout(timer);controller=null;lock(false);$('analyze').innerHTML='분석 시작 <span>↗</span>';}
}
$('test-connection').onclick=async()=>{
  if(busy)return;const apiKey=$('key').value.trim();if(!apiKey){status('API 키를 먼저 입력하세요.',true);return}
  lock(true);controller=new AbortController();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller?.abort()},50000);status('Gemini 실제 응답을 확인하고 있습니다…');
  try{const data=await callApi('/api/connection',{apiKey},controller.signal);status(data.message)}catch(error){status(error.name==='AbortError'?(timedOut?'연결 확인 시간이 초과되었습니다.':'연결 확인을 취소했습니다.'):error.message,true)}finally{clearTimeout(timer);controller=null;lock(false)}
};
$('show').onclick=()=>{const show=$('key').type==='password';$('key').type=show?'text':'password';$('show').textContent=show?'숨김':'표시'};
$('text').oninput=()=>{$('count').textContent=$('text').value.length.toLocaleString()+'자'};
$('clear').onclick=()=>{if(busy)return;window.reviewCommunity?.clear();selected=null;result=null;$('file').value='';$('text').value='';$('count').textContent='0자';$('filename').textContent='파일을 끌어 놓거나 선택하세요';$('fileinfo').textContent='보고서 한 개를 업로드하면 자동으로 분석합니다.';$('results').hidden=true;status('')};
$('file').onchange=e=>choose(e.target.files[0]);$('drop').onclick=e=>{if(busy)e.preventDefault()};$('drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy)$('file').click()}};
for(const name of ['dragenter','dragover'])$('drop').addEventListener(name,e=>{e.preventDefault();if(!busy)$('drop').classList.add('drag')});
for(const name of ['dragleave','drop'])$('drop').addEventListener(name,e=>{e.preventDefault();$('drop').classList.remove('drag')});
$('drop').addEventListener('drop',e=>{if(e.dataTransfer.files.length!==1){status('보고서는 한 개씩 선택하세요.',true);return}choose(e.dataTransfer.files[0])});
$('analyze').onclick=analyze;$('cancel').onclick=()=>controller?.abort();
$('copy').onclick=async()=>{if(!result)return;try{await navigator.clipboard.writeText(report());status('검토 결과를 복사했습니다.')}catch{status('복사 권한을 사용할 수 없습니다. 결과 다운로드를 이용하세요.',true)}};
$('download').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob(['\ufeff'+report()],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='보고서_검토결과.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
window.addEventListener('pagehide',()=>{$('key').value='';controller?.abort()});
