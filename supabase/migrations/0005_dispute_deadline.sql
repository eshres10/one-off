-- Evidence deadline for payment disputes (from Stripe dispute.evidence_details.due_by).
alter table public.disputes add column if not exists evidence_due_by timestamptz;
