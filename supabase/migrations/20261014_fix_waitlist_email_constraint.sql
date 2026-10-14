alter table public.open_round_waitlist
  drop constraint if exists open_round_waitlist_email_format;

alter table public.open_round_waitlist
  add constraint open_round_waitlist_email_format
  check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');
