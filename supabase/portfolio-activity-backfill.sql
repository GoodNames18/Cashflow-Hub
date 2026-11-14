alter table public.cfh_portfolio_activity
 add column imported boolean not null default false;
create index cfh_portfolio_activity_timeline_idx
 on public.cfh_portfolio_activity (owner_id,occurred_at desc,id desc);

-- Recover a starting entry from the earliest saved version of each record.
insert into public.cfh_portfolio_activity
 (owner_id,occurred_at,operation,source,record_id,after_data,imported)
select r.owner_id,r.created_at,'Added','record',r.id,coalesce(first.before_data,r.payload),true
from public.cfh_portfolio_records r
left join lateral (
 select a.operation,a.before_data
 from public.cfh_portfolio_activity a
 where a.owner_id=r.owner_id and a.record_id=r.id
 order by a.id limit 1
) first on true
where first.operation is null or first.operation in ('Edited','Deleted');
