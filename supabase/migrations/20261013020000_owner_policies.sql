-- Historical schema: owner policies.
create policy "owners create workflows" on public.workflows
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update own workflows" on public.workflows
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
