-- Additive upgrade for assigning multiple pets from the same owner to one POS sale.
create table if not exists public.transaction_pets (
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (transaction_id, pet_id)
);

create index if not exists idx_transaction_pets_pet
  on public.transaction_pets(pet_id);

-- Preserve the primary pet of every existing transaction in the new relationship.
insert into public.transaction_pets(transaction_id, pet_id)
select id, pet_id from public.transactions
where pet_id is not null
on conflict (transaction_id, pet_id) do nothing;

alter table public.transaction_pets enable row level security;
drop policy if exists "PawCruz transaction pets access" on public.transaction_pets;
create policy "PawCruz transaction pets access"
  on public.transaction_pets for all to authenticated
  using (true) with check (true);

grant select, insert on public.transaction_pets to authenticated;

