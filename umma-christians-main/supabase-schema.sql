-- Kajiado Christian Fellowship production Supabase schema
-- Paste this into Supabase SQL Editor and run on a fresh project.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.office_admins oa
    where oa.user_id = auth.uid()
      and oa.is_active = true
  );
$$;

create or replace function public.current_user_email()
returns citext
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '');
$$;

create or replace function public.generate_member_code()
returns trigger
language plpgsql
as $$
begin
  if new.member_code is null or btrim(new.member_code) = '' then
    new.member_code := 'KCF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

create table if not exists public.site_config (
  id text primary key default 'current',
  verse_reference text not null default '',
  verse_text text not null default '',
  theme_year text not null default '',
  theme_day text not null default '',
  theme_semester text not null default '',
  contact_email citext not null default '',
  fellowship_day text not null default '',
  fellowship_time text not null default '',
  fellowship_venue text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  day text not null default '',
  title text not null default '',
  time text not null default '',
  venue text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  image_base64 text not null default '',
  image_url text not null default '',
  open_link text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null default '',
  type text not null default 'info',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  member_code text not null unique,
  organization_name text not null,
  organization_type text not null check (
    organization_type in ('Church', 'Christian Institution', 'Ministry', 'Christian Organization')
  ),
  contact_name text not null,
  email citext not null unique,
  phone text not null default '',
  location text not null default '',
  county text not null default '',
  town text not null default '',
  description text not null default '',
  website text not null default '',
  logo_url text not null default '',
  membership_status text not null default 'pending' check (
    membership_status in ('pending', 'active', 'suspended', 'rejected')
  ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null default 'member' check (membership_role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('pending', 'active', 'suspended', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  event_type text not null default 'KCF Event' check (
    event_type in ('KCF Event', 'Church Event', 'Institution Event', 'Ministry Event', 'Member Event')
  ),
  event_date date not null,
  start_time time,
  end_time time,
  location text not null default '',
  image_url text not null default '',
  organization_id uuid references public.members(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.events
  add column if not exists organization_id uuid references public.members(id) on delete set null;

alter table if exists public.events
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table if exists public.events
  add column if not exists status text not null default 'published';

create table if not exists public.member_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  member_code text not null default '',
  organizer text not null default '',
  organizer_type text not null default '',
  source_type text not null default 'member' check (source_type in ('kcf', 'member', 'church', 'institution', 'ministry')),
  title text not null,
  description text not null default '',
  category text not null default 'General',
  event_date date not null,
  start_time text not null default '',
  end_time text not null default '',
  venue text not null default '',
  contact_info text not null default '',
  banner_url text not null default '',
  registration_link text not null default '',
  poll_question text not null default 'Will you be joining us?',
  poll_yes integer not null default 0 check (poll_yes >= 0),
  poll_maybe integer not null default 0 check (poll_maybe >= 0),
  poll_no integer not null default 0 check (poll_no >= 0),
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.member_events
  add column if not exists status text not null default 'published';

alter table if exists public.feedback
  add column if not exists status text not null default 'new';

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.member_events(id) on delete cascade,
  question text not null default 'Will you be joining us?',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, label)
);

create table if not exists public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

create table if not exists public.event_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.member_events(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  response text not null default 'maybe' check (response in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  target_member_id uuid references public.members(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info', 'event', 'membership', 'system')),
  is_read boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email citext not null,
  phone text not null default '',
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_member_owner(member_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.id = member_row_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(org_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = org_row_id
      and om.user_id = auth.uid()
      and om.membership_role in ('owner', 'admin')
      and om.status = 'active'
  ) or public.is_admin();
$$;

create index if not exists idx_programs_created_at on public.programs (created_at desc);
create index if not exists idx_events_event_date on public.events (event_date);
create index if not exists idx_events_organization_id on public.events (organization_id);
create index if not exists idx_events_status on public.events (status);
create index if not exists idx_members_user_id on public.members (user_id);
create index if not exists idx_members_membership_status on public.members (membership_status);
create index if not exists idx_org_memberships_org_id on public.organization_memberships (organization_id);
create index if not exists idx_org_memberships_user_id on public.organization_memberships (user_id);
create index if not exists idx_member_events_member_id on public.member_events (member_id);
create index if not exists idx_member_events_event_date on public.member_events (event_date);
create index if not exists idx_member_events_status on public.member_events (status);
create index if not exists idx_polls_event_id on public.polls (event_id);
create index if not exists idx_poll_responses_poll_id on public.poll_responses (poll_id);
create index if not exists idx_event_polls_event_id on public.event_polls (event_id);
create index if not exists idx_event_polls_member_id on public.event_polls (member_id);
create index if not exists idx_notifications_target_member_id on public.notifications (target_member_id);
create index if not exists idx_notifications_recipient_user_id on public.notifications (recipient_user_id);
create index if not exists idx_feedback_status on public.feedback (status);

create table if not exists public.office_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null default '',
  role text not null default 'admin' check (role in ('admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.office_admins oa
    where oa.user_id = auth.uid()
      and oa.is_active = true
  );
$$;

comment on table public.members is 'KCF organization profiles for churches, ministries and Christian institutions.';
comment on table public.member_events is 'Events created by KCF members and member organizations.';
comment on table public.office_admins is 'Authorized KCF administrators.';
comment on table public.feedback is 'Messages submitted from the public contact form.';

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  );

  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), display_name, 'member')
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

create or replace function public.add_member_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_memberships (organization_id, user_id, membership_role, status)
  values (new.id, new.user_id, 'owner', coalesce(new.membership_status, 'pending'))
  on conflict (organization_id, user_id) do update
    set membership_role = excluded.membership_role,
        status = excluded.status,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists members_owner_membership on public.members;
create trigger members_owner_membership
after insert on public.members
for each row
execute function public.add_member_owner_membership();

drop trigger if exists members_generate_member_code on public.members;
create trigger members_generate_member_code
before insert on public.members
for each row
execute function public.generate_member_code();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_config_updated_at on public.site_config;
create trigger site_config_updated_at before update on public.site_config for each row execute function public.touch_updated_at();
drop trigger if exists programs_updated_at on public.programs;
create trigger programs_updated_at before update on public.programs for each row execute function public.touch_updated_at();
drop trigger if exists gallery_updated_at on public.gallery;
create trigger gallery_updated_at before update on public.gallery for each row execute function public.touch_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists members_updated_at on public.members;
create trigger members_updated_at before update on public.members for each row execute function public.touch_updated_at();
drop trigger if exists organization_memberships_updated_at on public.organization_memberships;
create trigger organization_memberships_updated_at before update on public.organization_memberships for each row execute function public.touch_updated_at();
drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events for each row execute function public.touch_updated_at();
drop trigger if exists member_events_updated_at on public.member_events;
create trigger member_events_updated_at before update on public.member_events for each row execute function public.touch_updated_at();
drop trigger if exists polls_updated_at on public.polls;
create trigger polls_updated_at before update on public.polls for each row execute function public.touch_updated_at();
drop trigger if exists poll_options_updated_at on public.poll_options;
create trigger poll_options_updated_at before update on public.poll_options for each row execute function public.touch_updated_at();
drop trigger if exists poll_responses_updated_at on public.poll_responses;
create trigger poll_responses_updated_at before update on public.poll_responses for each row execute function public.touch_updated_at();
drop trigger if exists event_polls_updated_at on public.event_polls;
create trigger event_polls_updated_at before update on public.event_polls for each row execute function public.touch_updated_at();
drop trigger if exists notifications_updated_at on public.notifications;
create trigger notifications_updated_at before update on public.notifications for each row execute function public.touch_updated_at();
drop trigger if exists feedback_updated_at on public.feedback;
create trigger feedback_updated_at before update on public.feedback for each row execute function public.touch_updated_at();
drop trigger if exists office_admins_updated_at on public.office_admins;
create trigger office_admins_updated_at before update on public.office_admins for each row execute function public.touch_updated_at();

alter table public.site_config enable row level security;
alter table public.programs enable row level security;
alter table public.gallery enable row level security;
alter table public.activity_logs enable row level security;
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.events enable row level security;
alter table public.member_events enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_responses enable row level security;
alter table public.event_polls enable row level security;
alter table public.notifications enable row level security;
alter table public.feedback enable row level security;
alter table public.office_admins enable row level security;

grant usage on schema public to anon, authenticated;

grant select on public.site_config to anon, authenticated;
grant select on public.programs to anon, authenticated;
grant select on public.gallery to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.member_events to anon, authenticated;
grant select on public.polls to anon, authenticated;
grant select on public.poll_options to anon, authenticated;

grant select, insert, update, delete on public.activity_logs to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.member_events to authenticated;
grant select, insert, update, delete on public.polls to authenticated;
grant select, insert, update, delete on public.poll_options to authenticated;
grant select, insert, update, delete on public.poll_responses to authenticated;
grant select, insert, update, delete on public.event_polls to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.feedback to authenticated;
grant select, insert, update, delete on public.office_admins to authenticated;

drop policy if exists "Public read site_config" on public.site_config;
create policy "Public read site_config"
on public.site_config
for select
to public
using (true);

drop policy if exists "Admins manage site_config" on public.site_config;
create policy "Admins manage site_config"
on public.site_config
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public read programs" on public.programs;
create policy "Public read programs"
on public.programs
for select
to public
using (true);

drop policy if exists "Admins manage programs" on public.programs;
create policy "Admins manage programs"
on public.programs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public read gallery" on public.gallery;
create policy "Public read gallery"
on public.gallery
for select
to public
using (true);

drop policy if exists "Admins manage gallery" on public.gallery;
create policy "Admins manage gallery"
on public.gallery
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins read activity logs" on public.activity_logs;
create policy "Admins read activity logs"
on public.activity_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins manage activity logs" on public.activity_logs;
create policy "Admins manage activity logs"
on public.activity_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Users manage own profile" on public.profiles;
create policy "Users manage own profile"
on public.profiles
for all
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "Members read own record" on public.members;
create policy "Members read own record"
on public.members
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Members create own record" on public.members;
create policy "Members create own record"
on public.members
for insert
to authenticated
with check (user_id = auth.uid() and created_by = auth.uid());

drop policy if exists "Members update own record" on public.members;
create policy "Members update own record"
on public.members
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage members" on public.members;
create policy "Admins manage members"
on public.members
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Org memberships read own" on public.organization_memberships;
create policy "Org memberships read own"
on public.organization_memberships
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Org memberships manage own" on public.organization_memberships;
create policy "Org memberships manage own"
on public.organization_memberships
for all
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Public read published events" on public.events;
create policy "Public read published events"
on public.events
for select
to public
using (status = 'published');

drop policy if exists "Admins manage events" on public.events;
create policy "Admins manage events"
on public.events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public read published member events" on public.member_events;
create policy "Public read published member events"
on public.member_events
for select
to public
using (status = 'published');

drop policy if exists "Members create own events" on public.member_events;
create policy "Members create own events"
on public.member_events
for insert
to authenticated
with check (member_id = auth.uid() and source_type in ('member', 'church', 'institution', 'ministry', 'kcf'));

drop policy if exists "Members update own events" on public.member_events;
create policy "Members update own events"
on public.member_events
for update
to authenticated
using (member_id = auth.uid() or public.is_admin())
with check (member_id = auth.uid() or public.is_admin());

drop policy if exists "Members delete own events" on public.member_events;
create policy "Members delete own events"
on public.member_events
for delete
to authenticated
using (member_id = auth.uid() or public.is_admin());

drop policy if exists "Public read active polls" on public.polls;
create policy "Public read active polls"
on public.polls
for select
to public
using (is_active = true);

drop policy if exists "Admins manage polls" on public.polls;
create policy "Admins manage polls"
on public.polls
for all
to authenticated
using (public.is_admin() or exists (
  select 1 from public.member_events me
  where me.id = polls.event_id and me.member_id = auth.uid()
))
with check (public.is_admin() or exists (
  select 1 from public.member_events me
  where me.id = polls.event_id and me.member_id = auth.uid()
));

drop policy if exists "Public read poll options" on public.poll_options;
create policy "Public read poll options"
on public.poll_options
for select
to public
using (
  exists (
    select 1
    from public.polls p
    where p.id = poll_options.poll_id
      and p.is_active = true
  )
);

drop policy if exists "Admins manage poll options" on public.poll_options;
create policy "Admins manage poll options"
on public.poll_options
for all
to authenticated
using (public.is_admin() or exists (
  select 1 from public.polls p
  join public.member_events me on me.id = p.event_id
  where p.id = poll_options.poll_id
    and me.member_id = auth.uid()
))
with check (public.is_admin() or exists (
  select 1 from public.polls p
  join public.member_events me on me.id = p.event_id
  where p.id = poll_options.poll_id
    and me.member_id = auth.uid()
));

drop policy if exists "Users read own poll responses" on public.poll_responses;
create policy "Users read own poll responses"
on public.poll_responses
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users create own poll responses" on public.poll_responses;
create policy "Users create own poll responses"
on public.poll_responses
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users update own poll responses" on public.poll_responses;
create policy "Users update own poll responses"
on public.poll_responses
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users read own compatibility poll responses" on public.event_polls;
create policy "Users read own compatibility poll responses"
on public.event_polls
for select
to authenticated
using (member_id = auth.uid() or public.is_admin());

drop policy if exists "Users create own compatibility poll responses" on public.event_polls;
create policy "Users create own compatibility poll responses"
on public.event_polls
for insert
to authenticated
with check (member_id = auth.uid());

drop policy if exists "Users update own compatibility poll responses" on public.event_polls;
create policy "Users update own compatibility poll responses"
on public.event_polls
for update
to authenticated
using (member_id = auth.uid() or public.is_admin())
with check (member_id = auth.uid() or public.is_admin());

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
on public.notifications
for select
to authenticated
using (
  recipient_user_id = auth.uid()
  or exists (
    select 1
    from public.members m
    where m.id = notifications.target_member_id
      and m.user_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists "Admins manage notifications" on public.notifications;
create policy "Admins manage notifications"
on public.notifications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public insert feedback" on public.feedback;
create policy "Public insert feedback"
on public.feedback
for insert
to public
with check (char_length(btrim(name)) > 0 and char_length(btrim(email::text)) > 0 and char_length(btrim(message)) > 0);

drop policy if exists "Admins read feedback" on public.feedback;
create policy "Admins read feedback"
on public.feedback
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins manage feedback" on public.feedback;
create policy "Admins manage feedback"
on public.feedback
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete feedback" on public.feedback;
create policy "Admins delete feedback"
on public.feedback
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins read office admins" on public.office_admins;
create policy "Admins read office admins"
on public.office_admins
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage office admins" on public.office_admins;
create policy "Admins manage office admins"
on public.office_admins
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;

-- OPTIONAL STORAGE BUCKETS (run in Supabase Dashboard if you use Storage)
-- Suggested buckets:
-- 1. organization-logos (public: true or false depending on your policy)
-- 2. event-images (public: true)
-- 3. gallery-images (public: true)
-- 4. profile-images (public: false)
--
-- Recommended path pattern:
-- organization-logos/{user_id}/{file_name}
-- event-images/{event_id}/{file_name}
-- gallery-images/{year}/{file_name}
-- profile-images/{user_id}/{file_name}
