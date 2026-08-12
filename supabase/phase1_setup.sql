create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'staff', 'veterinarian', 'pet_owner');
create type public.account_status as enum ('active', 'inactive');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  username text not null unique,
  email text not null unique,
  phone text,
  address text,
  role public.user_role not null default 'pet_owner',
  avatar_url text,
  account_status public.account_status not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  role public.user_role,
  action text not null,
  module text not null,
  related_record uuid,
  description text,
  ip_address inet,
  device_browser text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger security definer set search_path = public language plpgsql as $$
begin
  insert into public.profiles(auth_user_id, full_name, username, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || left(new.id::text, 6)),
    new.email,
    case when new.raw_user_meta_data->>'role' in ('admin','staff','veterinarian','pet_owner')
      then (new.raw_user_meta_data->>'role')::public.user_role else 'pet_owner' end
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.activity_logs enable row level security;

create policy "Users can read own profile" on public.profiles
for select using (auth.uid() = auth_user_id);
create policy "Users can update own basic profile" on public.profiles
for update using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

create or replace function public.current_user_role()
returns public.user_role stable security definer set search_path=public language sql as $$
  select role from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create policy "Admins can read all profiles" on public.profiles
for select using (public.current_user_role() = 'admin');
create policy "Admins can update all profiles" on public.profiles
for update using (public.current_user_role() = 'admin');
create policy "Admins can read activity logs" on public.activity_logs
for select using (public.current_user_role() = 'admin');

create index profiles_role_idx on public.profiles(role);
create index profiles_status_idx on public.profiles(account_status);
create index activity_logs_created_at_idx on public.activity_logs(created_at desc);
