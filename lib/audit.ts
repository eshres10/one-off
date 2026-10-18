import { sql, type Db } from '@/lib/db';
import { log } from '@/lib/log';

export async function audit(
  action: string,
  entity: { type: string; id?: string | null },
  metadata: Record<string, unknown> = {},
  actorUserId: string | null = null,
  db: Db = sql(),
) {
  log.info({ audit: action, entityType: entity.type, entityId: entity.id, actorUserId }, 'audit');
  await db`
    insert into public.audit_events (actor_user_id, action, entity_type, entity_id, metadata)
    values (${actorUserId}, ${action}, ${entity.type}, ${entity.id ?? null}, ${db.json(metadata as never)})`;
}
