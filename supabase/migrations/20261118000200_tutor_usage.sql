-- One shared counter per user, across all app instances. Requires the Step 1 schema.
begin;

create table jee_internal.tutor_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null check (requests between 1 and 20)
);
alter table jee_internal.tutor_usage enable row level security;
revoke all on jee_internal.tutor_usage from public, anon, authenticated, service_role;

-- Reserve before contacting OpenAI. A provider timeout can still incur a charge.
create function public.consume_tutor_request()
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if not exists (select 1 from auth.users u where u.id = actor
                 and not coalesce(u.is_anonymous, false)) then
    raise exception 'Sign in to use the tutor' using errcode = '42501';
  end if;

  insert into jee_internal.tutor_usage as usage (user_id, usage_day, requests)
    values (actor, today, 1)
  on conflict (user_id) do update
    set usage_day = excluded.usage_day,
        requests = case when usage.usage_day < excluded.usage_day then 1
                        else usage.requests + 1 end
    where usage.usage_day < excluded.usage_day
       or (usage.usage_day = excluded.usage_day and usage.requests < 20);
  return found;
end;
$$;
revoke all on function public.consume_tutor_request() from public, anon, authenticated, service_role;
grant execute on function public.consume_tutor_request() to authenticated;

commit;
