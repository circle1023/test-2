-- Run once in Supabase SQL Editor. The Vercel server is the only database caller.
begin;
create table public.public_reviews (
  id uuid primary key,
  owner_id uuid not null,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
  evaluation jsonb not null check (
    jsonb_typeof(evaluation) = 'object'
    and evaluation ?& array['score','overview','criteria','strengths','improvements']
    and (evaluation - array['score','overview','criteria','strengths','improvements']) = '{}'::jsonb
    and octet_length(evaluation::text) <= 200000
  ),
  created_at timestamptz not null default now()
);
create table public.review_feedback (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.public_reviews(id) on delete cascade,
  owner_id uuid not null,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 40),
  rating smallint check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(review_id,owner_id),
  check(rating is not null or char_length(btrim(comment))>0)
);
create index public_reviews_date_idx on public.public_reviews(created_at desc,id desc);
create index public_reviews_owner_idx on public.public_reviews(owner_id,created_at desc);
create index feedback_review_date_idx on public.review_feedback(review_id,created_at desc,id desc);
create index feedback_owner_update_idx on public.review_feedback(owner_id,updated_at desc);
alter table public.public_reviews enable row level security;
alter table public.review_feedback enable row level security;
revoke all on public.public_reviews,public.review_feedback from public,anon,authenticated;
grant select,insert,delete on public.public_reviews to service_role;
grant select,insert,update,delete on public.review_feedback to service_role;
-- No anonymous/authenticated policies: public access goes through the filtered Vercel API.
create view public.review_feed with (security_invoker=true) as
select r.*, f.average_rating, coalesce(f.rating_count,0) as rating_count, coalesce(f.comment_count,0) as comment_count
from public.public_reviews r left join lateral (
  select round(avg(rating)::numeric,1) as average_rating,count(rating) as rating_count,
         count(*) filter(where btrim(comment)<>'') as comment_count
  from public.review_feedback where review_id=r.id
) f on true;
revoke all on public.review_feed from public,anon,authenticated;
grant select on public.review_feed to service_role;

create function public.publish_review(p_id uuid,p_owner uuid,p_name text,p_evaluation jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  if exists(select 1 from public.public_reviews where id=p_id and owner_id=p_owner) then return p_id; end if;
  if (select count(*) from public.public_reviews where owner_id=p_owner and created_at>now()-interval '1 hour')>=10 then raise exception 'RATE_LIMIT'; end if;
  insert into public.public_reviews(id,owner_id,author_name,evaluation) values(p_id,p_owner,btrim(p_name),p_evaluation);
  return p_id;
end; $$;
create function public.save_review_feedback(p_review uuid,p_owner uuid,p_name text,p_rating smallint,p_comment text)
returns void language plpgsql security invoker set search_path='' as $$
declare review_owner uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select owner_id into review_owner from public.public_reviews where id=p_review;
  if review_owner is null then raise exception 'NOT_FOUND'; end if;
  if review_owner=p_owner then raise exception 'SELF_FEEDBACK'; end if;
  if exists(select 1 from public.review_feedback where owner_id=p_owner and updated_at>now()-interval '5 seconds') then raise exception 'RATE_LIMIT'; end if;
  if (select count(*) from public.review_feedback where owner_id=p_owner and updated_at>now()-interval '1 hour')>=30 then raise exception 'RATE_LIMIT'; end if;
  insert into public.review_feedback(review_id,owner_id,author_name,rating,comment)
  values(p_review,p_owner,btrim(p_name),p_rating,btrim(p_comment))
  on conflict(review_id,owner_id) do update set author_name=excluded.author_name,rating=excluded.rating,comment=excluded.comment,updated_at=now();
end; $$;
revoke all on function public.publish_review(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_review_feedback(uuid,uuid,text,smallint,text) from public,anon,authenticated;
grant execute on function public.publish_review(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.save_review_feedback(uuid,uuid,text,smallint,text) to service_role;
commit;
