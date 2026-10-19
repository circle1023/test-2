(() => {
  const el=id=>document.getElementById(id),esc=escapeHTML;
  let proof=null,configured=false,page=0,activeId=null,feedbackPage=0,listRequest=0,detailRequest=0,writing=false;
  const say=(id,message,error=false)=>{el(id).textContent=message;el(id).classList.toggle('error',error)};
  const date=value=>new Date(value).toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'short'});
  const items=values=>'<ul>'+values.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  function evaluationHTML(e){return `<div class="public-score">AI 평가 <strong>${esc(e.score)}</strong> / 100</div><p>${esc(e.overview)}</p>`+e.criteria.map(c=>`<div class="rating"><div>${esc(c.name)}<p>${esc(c.feedback)}</p></div><span>${esc(c.score)} / 25</span></div>`).join('')+'<h4>잘한 점</h4>'+items(e.strengths)+'<h4>개선할 점</h4>'+items(e.improvements)}
  async function request(params={},body){
    const response=await fetch('/api/community'+(body?'':'?'+new URLSearchParams(params)),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json()}catch{throw new Error('게시판 응답을 읽지 못했습니다. 다시 시도하세요.')}
    if(!response.ok)throw new Error(data.error?.message||'게시판 요청에 실패했습니다.');return data;
  }
  window.reviewCommunity={
    clear(){proof=null;el('share-preview').replaceChildren();el('share-consent').checked=false;el('publish-review').disabled=true;say('share-status','');},
    completed(data){proof=data.shareProof;el('share-preview').innerHTML=evaluationHTML(data.result.evaluation);el('share-consent').checked=false;el('publish-review').disabled=!proof;say('share-status',proof?'공개할 평가 내용을 확인한 뒤 이름을 입력하고 저장하세요.':'현재 공개 저장을 사용할 수 없습니다. 게시판 설정이 완료된 뒤 다시 분석해 주세요.');}
  };
  async function loadList(){
    const version=++listRequest;try{const data=await request({page});if(version!==listRequest)return;configured=data.configured;
      if(!configured){el('review-list').replaceChildren();say('board-status','공개 평가 게시판을 준비 중입니다.');el('board-next').disabled=true;el('board-prev').disabled=true;return;}
      say('board-status',data.reviews.length?'이름은 사용자가 직접 입력한 표시 이름입니다.':'아직 공개된 평가가 없습니다. 첫 평가를 공유해 보세요.');
      el('review-list').innerHTML=data.reviews.map(r=>`<button type="button" class="review-card" data-review="${esc(r.id)}"><span class="eyebrow">${r.is_mine?'MY EVALUATION':'PUBLIC EVALUATION'}</span><h3>${esc(r.author_name)}님의 AI 평가</h3><div class="card-score">${esc(r.evaluation.score)}<span> / 100</span></div><p>${esc(r.evaluation.overview.slice(0,160))}${r.evaluation.overview.length>160?'…':''}</p><div class="review-meta"><span>★ ${r.average_rating===null?'아직 없음':esc(r.average_rating)} · ${esc(r.rating_count)}명</span><span>댓글 ${esc(r.comment_count)}</span></div><time>${esc(date(r.created_at))}</time></button>`).join('');
      el('board-page').textContent=String(page+1);el('board-prev').disabled=page===0;el('board-next').disabled=!data.hasMore;
    }catch(error){if(version===listRequest)say('board-status',error.message||'게시판에 연결하지 못했습니다.',true)}
  }
  async function loadDetail(id,{reset=false}={}){
    if(reset){el('feedback-form').hidden=true;el('delete-review').hidden=true;el('delete-feedback').hidden=true;el('detail-evaluation').replaceChildren();el('feedback-list').replaceChildren();el('detail-name').textContent='평가를 불러오는 중…';el('detail-date').textContent='';el('detail-rating').textContent='';}
    const version=++detailRequest;try{const data=await request({id,page:feedbackPage});if(version!==detailRequest||id!==activeId)return;
      if(!data.configured)throw new Error('게시판이 아직 준비되지 않았습니다.');
      el('review-detail').hidden=false;el('detail-name').textContent=data.review.author_name+'님의 AI 평가';el('detail-date').textContent=date(data.review.created_at);el('detail-evaluation').innerHTML=evaluationHTML(data.review.evaluation);
      el('detail-rating').textContent=`방문자 별점 ${data.review.average_rating??'—'} / 5 · ${data.review.rating_count}명 · 댓글 ${data.review.comment_count}개`;
      el('delete-review').hidden=!data.review.is_mine;el('feedback-form').hidden=data.review.is_mine;el('self-feedback-note').hidden=!data.review.is_mine;
      el('feedback-list').innerHTML=data.feedback.map(f=>`<article class="feedback-card"><div class="review-meta"><strong>${esc(f.author_name)} ${f.is_mine?'(나)':''}</strong><span>${f.rating===null?'댓글만 작성':'★ '+esc(f.rating)+' / 5'}</span></div>${f.comment?'<p>'+esc(f.comment)+'</p>':''}<time>${esc(date(f.updated_at))}</time></article>`).join('')||'<p>아직 별점이나 댓글이 없습니다.</p>';
      el('feedback-prev').disabled=feedbackPage===0;el('feedback-next').disabled=!data.hasMore;el('feedback-page').textContent=String(feedbackPage+1);
      el('delete-feedback').hidden=!data.mine;el('delete-feedback').dataset.id=data.mine?.id||'';
      if(reset){el('feedback-name').value=data.mine?.author_name||el('share-name').value;el('feedback-rating').value=data.mine?.rating==null?'':String(data.mine.rating);el('feedback-comment').value=data.mine?.comment||'';say('feedback-status','');}
    }catch(error){if(version===detailRequest)say('feedback-status',error.message||'평가를 불러오지 못했습니다.',true)}
  }
  el('publish-review').onclick=async()=>{
    if(writing||!proof)return;if(!el('share-name').value.trim()){say('share-status','이름을 입력하세요.',true);return}if(!el('share-consent').checked){say('share-status','이름과 AI 평가가 공개되는 것에 동의해 주세요.',true);return}
    writing=true;el('publish-review').disabled=true;try{const data=await request({},{action:'publish',name:el('share-name').value,proof,consent:true});say('share-status','AI 평가를 공개 저장했습니다.');proof=null;page=0;await loadList();activeId=data.id;feedbackPage=0;await loadDetail(activeId,{reset:true});el('review-detail').scrollIntoView({behavior:'smooth'});}catch(error){say('share-status',error.message||'저장하지 못했습니다.',true)}finally{writing=false;el('publish-review').disabled=!proof}
  };
  el('review-list').onclick=event=>{const card=event.target.closest('[data-review]');if(!card||writing)return;activeId=card.dataset.review;feedbackPage=0;el('review-detail').hidden=false;say('feedback-status','평가를 불러오는 중…');loadDetail(activeId,{reset:true}).then(()=>el('review-detail').scrollIntoView({behavior:'smooth'}));};
  el('feedback-form').onsubmit=async event=>{event.preventDefault();if(writing||!activeId)return;writing=true;el('save-feedback').disabled=true;const id=activeId;
    try{await request({},{action:'feedback',reviewId:id,name:el('feedback-name').value,rating:el('feedback-rating').value?Number(el('feedback-rating').value):null,comment:el('feedback-comment').value});say('feedback-status','별점·댓글을 저장했습니다.');feedbackPage=0;await Promise.all([loadDetail(id),loadList()]);}catch(error){say('feedback-status',error.message||'저장하지 못했습니다.',true)}finally{writing=false;el('save-feedback').disabled=false}
  };
  el('delete-review').onclick=async()=>{if(writing||!activeId||!confirm('공개 평가와 연결된 모든 별점·댓글을 삭제할까요?'))return;writing=true;try{await request({},{action:'delete-review',id:activeId});activeId=null;detailRequest++;el('review-detail').hidden=true;await loadList()}catch(error){say('feedback-status',error.message,true)}finally{writing=false}};
  el('delete-feedback').onclick=async()=>{if(writing||!confirm('내 별점과 댓글을 삭제할까요?'))return;writing=true;try{await request({},{action:'delete-feedback',id:el('delete-feedback').dataset.id});await Promise.all([loadDetail(activeId,{reset:true}),loadList()])}catch(error){say('feedback-status',error.message,true)}finally{writing=false}};
  el('close-detail').onclick=()=>{if(writing)return;activeId=null;detailRequest++;el('review-detail').hidden=true};
  el('board-refresh').onclick=loadList;el('board-prev').onclick=()=>{page=Math.max(0,page-1);loadList()};el('board-next').onclick=()=>{page++;loadList()};
  el('feedback-prev').onclick=()=>{if(writing)return;feedbackPage=Math.max(0,feedbackPage-1);loadDetail(activeId)};el('feedback-next').onclick=()=>{if(writing)return;feedbackPage++;loadDetail(activeId)};
  // Refresh public data, preserving any name/comment currently being typed.
  setInterval(()=>{if(!document.hidden&&!writing){loadList();if(activeId)loadDetail(activeId)}},30000);
  loadList();
})();
