-- The maker survey at survey.offone.com.au (lib/survey/questions.ts holds the questions).
-- Answers are stored as option keys. Contact details only exist when the maker opted in.
-- No device data: rate limiting uses a daily-salted hash in rate_limits, kept for 24 hours.

create table if not exists public.maker_survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  src text check (src is null or src ~ '^[a-z0-9_-]{1,40}$'),
  ref text check (ref is null or ref ~ '^[a-z0-9_-]{1,40}$'),
  q1_instagram_share text check (q1_instagram_share in ('none', 'lt25', '25_50', '50_75', 'most')),
  q2_monthly_volume text check (q2_monthly_volume in ('0_5', '6_20', '21_50', '50p')),
  q3_typical_price text check (q3_typical_price in ('lt100', '100_250', '250_500', '500p')),
  q4_commission text check (q4_commission in ('lt8', '8_12', '12_18', '18_25', 'free_only')),
  q5_mto_share text check (q5_mto_share in ('none', 'some', 'half', 'most', 'want_more')),
  q6_custom_today text check (q6_custom_today in ('make', 'quote_drop', 'decline', 'none')),
  q7_biggest_cost text check (q7_biggest_cost in ('returns', 'sizing', 'payments', 'ghosting', 'shipping', 'visibility')),
  q8_payout_need text check (q8_payout_need in ('same_day', 'week', '3_after', 'deposit_ok')),
  q9_blockers text[] not null default '{}' check (
    cardinality(q9_blockers) <= 2
    and q9_blockers <@ array['fees', 'buyers', 'brand', 'admin', 'returns', 'fast_fashion', 'nothing']::text[]
  ),
  q10_founding text check (q10_founding in ('want_in', 'wait', 'more', 'no')),
  q11_wish text check (q11_wish is null or char_length(q11_wish) <= 500),
  follow_up text check (follow_up is null or follow_up in ('no', 'chat', 'founding')),
  contact_name text check (contact_name is null or char_length(contact_name) <= 80),
  label_name text check (label_name is null or char_length(label_name) <= 80),
  contact_email citext check (contact_email is null or char_length(contact_email) <= 254),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  consent_contact boolean not null default false,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  contacted_at timestamptz,
  -- Contact details only ever exist alongside an opt-in and consent.
  constraint maker_survey_contact_needs_consent check (
    (contact_name is null and label_name is null and contact_email is null and instagram is null)
    or (consent_contact and follow_up in ('chat', 'founding'))
  )
);

create index if not exists maker_survey_responses_created_idx on public.maker_survey_responses (created_at desc);
create index if not exists maker_survey_responses_src_idx on public.maker_survey_responses (src, ref);

-- Written only by the server (service role); read only by admins.
alter table public.maker_survey_responses enable row level security;
revoke all on public.maker_survey_responses from anon, authenticated;
grant all on public.maker_survey_responses to service_role;
grant select, update on public.maker_survey_responses to authenticated;

drop policy if exists maker_survey_admin_read on public.maker_survey_responses;
create policy maker_survey_admin_read on public.maker_survey_responses for select
  using (public.is_admin());
drop policy if exists maker_survey_admin_update on public.maker_survey_responses;
create policy maker_survey_admin_update on public.maker_survey_responses for update
  using (public.is_admin()) with check (public.is_admin());
