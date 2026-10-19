import { send,errorResponse,AppError } from '../lib/http.js';
import { actor,communityIssues,communityReady,requireCommunity,communityBody,displayName,uuid,readShareProof,db } from '../lib/community.js';
const reviewColumns='id,author_name,evaluation,created_at,owner_id,average_rating,rating_count,comment_count';
function pageNumber(raw){const n=Number(raw||0);if(!Number.isInteger(n)||n<0||n>10000)throw new AppError(400,'PAGE','잘못된 페이지입니다.');return n;}
function publicReview(row,owner){const {owner_id,...data}=row;return {...data,is_mine:owner_id===owner};}
export default async function handler(req,res){
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      if(!communityReady())return send(res,200,{configured:false,configurationIssues:communityIssues(),reviews:[],hasMore:false});
      const owner=actor(req,res,false);const id=url.searchParams.get('id');
      if(id){uuid(id);const rows=await db('review_feed?'+new URLSearchParams({select:reviewColumns,id:'eq.'+id}));if(!rows.length)throw new AppError(404,'NOT_FOUND','게시물이 삭제되었거나 존재하지 않습니다.');
        const page=pageNumber(url.searchParams.get('page'));const feedback=await db('review_feedback?'+new URLSearchParams({select:'id,author_name,rating,comment,created_at,updated_at,owner_id',review_id:'eq.'+id,order:'created_at.desc,id.desc',limit:'21',offset:String(page*20)}));
        let own=[];if(owner)own=await db('review_feedback?'+new URLSearchParams({select:'id,author_name,rating,comment,created_at,updated_at',review_id:'eq.'+id,owner_id:'eq.'+owner,limit:'1'}));
        return send(res,200,{configured:true,review:publicReview(rows[0],owner),feedback:feedback.slice(0,20).map(r=>publicReview(r,owner)),mine:own[0]||null,hasMore:feedback.length>20});
      }
      const page=pageNumber(url.searchParams.get('page'));const rows=await db('review_feed?'+new URLSearchParams({select:reviewColumns,order:'created_at.desc,id.desc',limit:'13',offset:String(page*12)}));
      return send(res,200,{configured:true,reviews:rows.slice(0,12).map(r=>publicReview(r,owner)),hasMore:rows.length>12});
    }
    const body=communityBody(req);requireCommunity();const owner=actor(req,res,true);
    if(body.action==='publish'){
      const author=displayName(body.name);if(body.consent!==true)throw new AppError(400,'CONSENT','이름과 평가 공개에 동의해 주세요.');
      const proof=readShareProof(body.proof,owner);
      // Only the verified evaluation is sent to the database. Ignore every other client field.
      await db('rpc/publish_review',{method:'POST',body:{p_id:proof.id,p_owner:owner,p_name:author,p_evaluation:proof.evaluation}});
      return send(res,201,{id:proof.id});
    }
    if(body.action==='feedback'){
      const id=uuid(body.reviewId),name=displayName(body.name),rating=body.rating??null;
      if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))throw new AppError(400,'RATING','별점은 1~5점으로 선택하세요.');
      if(typeof body.comment!=='string'||body.comment.trim().length>1000)throw new AppError(400,'COMMENT','댓글은 1,000자 이하로 입력하세요.');const comment=body.comment.trim();
      if(rating===null&&!comment)throw new AppError(400,'EMPTY_FEEDBACK','별점 또는 댓글을 입력하세요.');
      await db('rpc/save_review_feedback',{method:'POST',body:{p_review:id,p_owner:owner,p_name:name,p_rating:rating,p_comment:comment}});return send(res,200,{ok:true});
    }
    if(body.action==='delete-review'||body.action==='delete-feedback'){
      const id=uuid(body.id);const table=body.action==='delete-review'?'public_reviews':'review_feedback';
      const deleted=await db(table+'?'+new URLSearchParams({id:'eq.'+id,owner_id:'eq.'+owner,select:'id'}),{method:'DELETE',prefer:'return=representation'});
      if(!deleted?.length)throw new AppError(403,'NOT_OWNER','이 브라우저에서 작성한 내용만 삭제할 수 있습니다.');return send(res,200,{ok:true});
    }
    throw new AppError(400,'ACTION','지원하지 않는 요청입니다.');
  }catch(error){errorResponse(res,error instanceof AppError?error:new AppError(503,'COMMUNITY_ERROR','게시판 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'))}
}
