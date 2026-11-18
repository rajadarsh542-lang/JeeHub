-- JeeHub / Step 1. Apply once as the migration owner on Supabase PostgreSQL 15+.
-- Assumes standard Supabase Auth, roles, and a fresh set of app tables in public.
-- Markdown fields can include LaTeX and image references. Expose only public asset URLs.
begin;

create schema jee_internal;
revoke all on schema jee_internal from public, anon, authenticated;

create type public.jee_exam as enum ('jee_main', 'jee_advanced');
create type public.jee_subject as enum ('physics', 'chemistry', 'mathematics');
create type public.jee_question_kind as enum
  ('single_choice', 'multiple_choice', 'numerical', 'matching', 'other');

-- Supabase owns identities, emails and credentials. This is the display profile.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student'
    check (display_name ~ '[^[:space:]]' and char_length(display_name) <= 60)
);

-- Validate the ordered option array as it is written by an importer/editor.
create function jee_internal.valid_options(items jsonb)
returns boolean language plpgsql immutable strict set search_path = '' as $$
begin
  if jsonb_typeof(items) <> 'array' then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(items) as e(item)
    where jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item -> 'id') is distinct from 'string'
       or jsonb_typeof(item -> 'content_md') is distinct from 'string'
       or btrim(item ->> 'id') = ''
       or btrim(item ->> 'content_md') = ''
  ) and not exists (
    select 1 from jsonb_array_elements(items) as e(item)
    group by item ->> 'id' having count(*) > 1
  );
end;
$$;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  source_name text not null check (btrim(source_name) <> ''),
  paper_slug text not null check (btrim(paper_slug) <> ''),
  source_qid text not null check (btrim(source_qid) <> ''),
  language_code text not null default 'en' check (btrim(language_code) <> ''),
  source_url text,
  attribution text,
  exam public.jee_exam not null,
  exam_year smallint not null check (exam_year between 1900 and 9999),
  exam_date date check (extract(year from exam_date) = exam_year),
  shift smallint check (shift in (1, 2)),
  paper_number smallint check (paper_number in (1, 2)),
  question_number text,
  subject public.jee_subject,
  chapter text check (btrim(chapter) <> ''),
  topic text check (btrim(topic) <> ''),
  kind public.jee_question_kind not null,
  stem_md text not null check (btrim(stem_md) <> ''),
  options jsonb not null default '[]'::jsonb
    check (jee_internal.valid_options(options)),
  -- Original keyed response, retained as supplied. Editorial verification is separate.
  source_answer_key jsonb,
  content_revision integer not null default 1 check (content_revision > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_name, paper_slug, source_qid, language_code),
  check (case
    when kind in ('single_choice', 'multiple_choice') then jsonb_array_length(options) >= 2
    when kind = 'numerical' then options = '[]'::jsonb
    else true end)
);
create index questions_sitting_idx on public.questions
  (exam, exam_year, exam_date, shift, paper_number) where is_published;
create index questions_topic_idx on public.questions (subject, chapter, topic)
  where is_published;

-- A row is an editorial sign-off for this particular question/language.
-- For example, answer_md can express accepted option IDs, an interval or a dropped ruling.
-- A source answer key by itself does not create a verified worked solution.
create table public.verified_solutions (
  question_id uuid not null references public.questions(id) on delete cascade,
  question_revision integer not null default 1 check (question_revision > 0),
  answer_md text not null check (btrim(answer_md) <> ''),
  solution_md text not null check (btrim(solution_md) <> ''),
  source_reference text not null check (btrim(source_reference) <> ''),
  verifier_label text not null check (btrim(verifier_label) <> ''),
  verified_at timestamptz not null default now(),
  primary key (question_id, question_revision)
);

-- A change to what the student solves invalidates the previous verification.
-- Previous sign-offs remain available to editors. Topic or visibility edits
-- do not invalidate a solution. Serial row updates allocate consecutive revisions.
create function jee_internal.track_question_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.content_revision := 1;
  elsif row(new.source_name, new.paper_slug, new.source_qid, new.language_code,
            new.kind, new.stem_md, new.options, new.source_answer_key) is distinct from
        row(old.source_name, old.paper_slug, old.source_qid, old.language_code,
            old.kind, old.stem_md, old.options, old.source_answer_key) then
    new.content_revision := old.content_revision + 1;
  else
    new.content_revision := old.content_revision;
  end if;
  return new;
end;
$$;
create trigger jee_question_revision before insert or update on public.questions
  for each row execute function jee_internal.track_question_revision();

create function jee_internal.check_solution_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.questions
    where id = new.question_id and content_revision = new.question_revision for share;
  if not found then
    raise exception 'Verify against the current question revision' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger jee_solution_revision before insert or update on public.verified_solutions
  for each row execute function jee_internal.check_solution_revision();

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  parent_id uuid,
  body text not null check (body ~ '[^[:space:]]' and char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  unique (id, question_id),
  check (parent_id is distinct from id),
  foreign key (parent_id, question_id) references public.comments(id, question_id)
    on delete set null (parent_id)
);
create index comments_question_time_idx on public.comments (question_id, created_at, id);
create index comments_author_idx on public.comments (author_id);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;

create table public.comment_votes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  voter_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (comment_id, voter_id)
);
create index comment_votes_voter_idx on public.comment_votes (voter_id);

-- Create profiles for future signups and existing accounts in the same transaction.
create function jee_internal.create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger jee_profile_after_signup after insert on auth.users
  for each row execute function jee_internal.create_profile();
insert into public.users (id) select id from auth.users on conflict (id) do nothing;

create function jee_internal.mark_comment_edited()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.edited_at := statement_timestamp();
  return new;
end;
$$;
create trigger jee_comment_edited before update of body on public.comments
  for each row when (old.body is distinct from new.body)
  execute function jee_internal.mark_comment_edited();

-- The client's rights never include the counter columns. A row-level UPDATE
-- increments the current totals atomically even when two students vote at once.
create function jee_internal.adjust_vote_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  up_delta integer := 0;
  down_delta integer := 0;
begin
  if tg_op = 'UPDATE' then
    if new.comment_id <> old.comment_id or new.voter_id <> old.voter_id then
      raise exception 'Vote identity is immutable' using errcode = '23514';
    end if;
    if new.value = old.value then return null; end if;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    target := old.comment_id;
    up_delta := up_delta - (old.value = 1)::integer;
    down_delta := down_delta - (old.value = -1)::integer;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    target := new.comment_id;
    up_delta := up_delta + (new.value = 1)::integer;
    down_delta := down_delta + (new.value = -1)::integer;
  end if;
  update public.comments
    set upvotes = upvotes + up_delta, downvotes = downvotes + down_delta
    where id = target;
  return null;
end;
$$;
create trigger jee_vote_totals after insert or update or delete on public.comment_votes
  for each row execute function jee_internal.adjust_vote_totals();

alter table public.users enable row level security;
alter table public.questions enable row level security;
alter table public.verified_solutions enable row level security;
alter table public.comments enable row level security;
alter table public.comment_votes enable row level security;

-- Strip default API role grants on these new objects only.
revoke all on public.users, public.questions, public.verified_solutions,
  public.comments, public.comment_votes from public, anon, authenticated, service_role;
revoke all on all functions in schema jee_internal from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema jee_internal to service_role;
grant execute on function jee_internal.valid_options(jsonb) to service_role;

grant select on public.users, public.questions, public.verified_solutions, public.comments
  to anon, authenticated;
grant update (display_name) on public.users to authenticated;
grant insert (question_id, parent_id, body), update (body), delete on public.comments to authenticated;
grant select, insert (comment_id, value), update (value), delete
  on public.comment_votes to authenticated;
grant select, insert, update, delete on public.questions, public.verified_solutions to service_role;
grant select, delete on public.users, public.comments, public.comment_votes to service_role;

create policy questions_read on public.questions for select to anon, authenticated
  using (is_published);
create policy solutions_read on public.verified_solutions for select to anon, authenticated
  using (exists (select 1 from public.questions q where q.id = verified_solutions.question_id
    and q.content_revision = verified_solutions.question_revision));

-- Descendant queries reuse questions_read and comments_read under caller RLS.
create policy comments_read on public.comments for select to anon, authenticated
  using (exists (select 1 from public.questions q where q.id = comments.question_id));
create policy comments_add on public.comments for insert to authenticated
  with check (author_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = comments.question_id));
create policy comments_edit on public.comments for update to authenticated
  using (author_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = comments.question_id))
  with check (author_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = comments.question_id));
create policy comments_remove on public.comments for delete to authenticated
  using (author_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = comments.question_id));

-- Public comment authors have public bylines. A student can always see their own profile.
create policy users_read_byline on public.users for select to anon, authenticated
  using (exists (select 1 from public.comments c where c.author_id = users.id));
create policy users_read_self on public.users for select to authenticated
  using (id = (select auth.uid()));
create policy users_edit_self on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy vote_self on public.comment_votes for all to authenticated
  using (voter_id = (select auth.uid())
    and exists (select 1 from public.comments c where c.id = comment_votes.comment_id))
  with check (voter_id = (select auth.uid())
    and exists (select 1 from public.comments c where c.id = comment_votes.comment_id));

-- The single idempotent vote operation executes with the student's RLS.
-- +1 upvotes, -1 downvotes, 0 removes the student's vote.
create function public.set_comment_vote(p_comment_id uuid, p_value smallint)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_comment_id is null or p_value is null or p_value not in (-1, 0, 1) then
    raise exception 'Expected a comment ID and vote of -1, 0 or 1' using errcode = '22023';
  end if;
  if p_value = 0 then
    delete from public.comment_votes where comment_id = p_comment_id and voter_id = (select auth.uid());
  else
    insert into public.comment_votes (comment_id, value) values (p_comment_id, p_value)
      on conflict (comment_id, voter_id) do update set value = excluded.value;
  end if;
end;
$$;
revoke all on function public.set_comment_vote(uuid, smallint) from public, anon, authenticated, service_role;
grant execute on function public.set_comment_vote(uuid, smallint) to authenticated;

commit;
