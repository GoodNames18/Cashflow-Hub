begin;
create extension if not exists pg_cron;
create table if not exists public.cfh_installment_plans (
 id uuid primary key, owner_id uuid not null default auth.uid(),
 item text not null check(length(item) between 1 and 120),
 total numeric(14,2) not null check(total>0),
 months integer not null check(months between 1 and 120),
 first_date date not null, created_at timestamptz not null default now()
);
create table if not exists public.cfh_installment_payments (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.cfh_installment_plans(id),
 owner_id uuid not null, number integer not null, due_date date not null,
 amount numeric(14,2) not null check(amount>0), posted boolean not null default false,
 unique(plan_id,number)
);
alter table public.cfh_installment_plans enable row level security;
alter table public.cfh_installment_payments enable row level security;
drop policy if exists installment_plans_owner on public.cfh_installment_plans;
create policy installment_plans_owner on public.cfh_installment_plans for all to authenticated
 using(owner_id=auth.uid() and auth.uid()='161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid)
 with check(owner_id=auth.uid() and auth.uid()='161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid);
drop policy if exists installment_payments_owner on public.cfh_installment_payments;
create policy installment_payments_owner on public.cfh_installment_payments for all to authenticated
 using(owner_id=auth.uid() and auth.uid()='161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid)
 with check(owner_id=auth.uid() and auth.uid()='161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid);
grant select,insert on public.cfh_installment_plans to authenticated;
grant select,insert,update(posted) on public.cfh_installment_payments to authenticated;
create or replace function public.cfh_post_installments() returns integer
language plpgsql security invoker set search_path='' as $$
declare p record; stamp timestamptz; label text; count_posted integer:=0;
begin
 if session_user<>'postgres' and auth.uid() is distinct from '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then
  raise exception 'Not authorized';
 end if;
 for p in select pay.*,plan.item,plan.months,plan.created_at as plan_created_at from public.cfh_installment_payments pay
 join public.cfh_installment_plans plan on plan.id=pay.plan_id
 where not pay.posted and pay.due_date <= (now() at time zone 'Asia/Manila')::date
 and pay.owner_id='161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid
 order by pay.due_date for update of pay skip locked loop
  stamp:=(p.due_date + (p.plan_created_at at time zone 'Asia/Manila')::time) at time zone 'Asia/Manila';
  label:=p.item||' — Installment '||p.number||'/'||p.months;
  insert into public.cfh_records(owner_id,client_request_id,tab_key,occurred_at,amount,category,description,payload,source_values)
  values(p.owner_id,p.id,'money_flow',stamp,p.amount,'Installment',label,
   jsonb_build_object('sheet','Money Flow','installment_plan',p.plan_id,'installment_number',p.number,'installment_months',p.months),
   jsonb_build_array(stamp,stamp,'',label,'Installment',p.amount,'',label))
  on conflict(owner_id,client_request_id) do nothing;
  update public.cfh_installment_payments set posted=true where id=p.id;
  count_posted:=count_posted+1;
 end loop;
 return count_posted;
end $$;
revoke all on function public.cfh_post_installments() from public,anon;
grant execute on function public.cfh_post_installments() to authenticated;
create or replace function public.cfh_create_installment(p_id uuid,p_item text,p_total numeric,p_months integer,p_first_date date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.cfh_installment_plans; i integer; anchor date; due date; base numeric; amount numeric; posted integer;
begin
 if auth.uid() is distinct from '161ecab1-d1d7-4fef-a089-a7300b9da774'::uuid then raise exception 'Not authorized';end if;
 if p_item is null or length(trim(p_item)) not between 1 and 120 or p_total is null or p_total<=0
 or p_total<>round(p_total,2) or p_months is null or p_months not between 1 and 120
 or p_first_date is null or p_first_date<'2000-01-01' or p_first_date>'2100-01-01'
 or floor(p_total*100/p_months)<1 then raise exception 'Enter a valid item, total, months and first payment date';end if;
 insert into public.cfh_installment_plans(id,item,total,months,first_date)
 values(p_id,trim(p_item),p_total,p_months,p_first_date) on conflict(id) do nothing;
 select * into existing from public.cfh_installment_plans where id=p_id;
 if existing.item<>trim(p_item) or existing.total<>p_total or existing.months<>p_months or existing.first_date<>p_first_date
 then raise exception 'Request already used for another installment';end if;
 base:=floor(p_total*100/p_months)/100;
 for i in 1..p_months loop
  anchor:=(date_trunc('month',p_first_date)+(i-1)*interval '1 month')::date;
  due:=anchor+least(extract(day from p_first_date)::integer,extract(day from anchor+interval '1 month'-interval '1 day')::integer)-1;
  amount:=case when i=p_months then p_total-base*(p_months-1) else base end;
  insert into public.cfh_installment_payments(plan_id,owner_id,number,due_date,amount)
  values(p_id,auth.uid(),i,due,amount) on conflict(plan_id,number) do nothing;
 end loop;
 posted:=public.cfh_post_installments();
 return jsonb_build_object('success',true,'id',p_id,'monthly',base,'months',p_months,'posted',posted);
end $$;
revoke all on function public.cfh_create_installment(uuid,text,numeric,integer,date) from public,anon;
grant execute on function public.cfh_create_installment(uuid,text,numeric,integer,date) to authenticated;
select cron.schedule('cfh-monthly-installments','0 * * * *','select public.cfh_post_installments();');
commit;