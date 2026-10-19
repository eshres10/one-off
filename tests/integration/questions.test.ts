import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withUser } from '@/lib/db';
import { askQuestion, replyToQuestion } from '@/lib/services/questions';
import { getQuestionsAndReviews } from '@/lib/queries/questions';
import { PRODUCTS, buyer } from './helpers';

afterAll(closeDb);

const product = PRODUCTS[0]!;

describe('product questions', () => {
  it('posts a question, emails the maker, and shows the maker’s reply publicly', async () => {
    const b = buyer(3);
    const id = await askQuestion(b, product.id, 'Is the lining cotton or satin?');
    await expect
      .poll(async () => {
        const [row] = await sql()<{ n: number }[]>`
        select count(*)::int as n from public.email_outbox
        where template = 'product_question' and related_entity_id = ${product.id}`;
        return row!.n;
      })
      .toBeGreaterThan(0);

    const maker = { id: product.maker.userId, role: 'seller' as const };
    await replyToQuestion(maker, id, 'Fully lined in cotton voile.');
    const entries = await getQuestionsAndReviews(product.id);
    const q = entries.find((e) => e.id === id);
    expect(q?.kind).toBe('question');
    expect(q?.kind === 'question' && q.replies.map((r) => r.body)).toEqual([
      'Fully lined in cotton voile.',
    ]);
  });

  it('refuses contact details, in the service and in the database', async () => {
    const b = buyer(3);
    await expect(askQuestion(b, product.id, 'Email me at someone@example.com')).rejects.toThrow(
      /public/,
    );
    await expect(
      withUser(
        b,
        (db) => db`
        insert into public.product_questions (product_id, user_id, body)
        values (${product.id}, ${b.id}, 'Call me on 0412 345 678')`,
      ),
    ).rejects.toThrow(/Contact details/);
  });

  it('only the piece’s maker can reply, and shoppers cannot post replies', async () => {
    const b = buyer(4);
    const id = await askQuestion(b, product.id, 'What length is it on a size 10?');
    await expect(
      withUser(
        b,
        (db) => db`
        insert into public.product_questions (product_id, user_id, body, parent_id, is_maker_reply)
        values (${product.id}, ${b.id}, 'Pretending to be the maker', ${id}, true)`,
      ),
    ).rejects.toThrow(/row-level security/);
    const other = PRODUCTS.find((p) => p.maker.id !== product.maker.id)!;
    await expect(
      replyToQuestion({ id: other.maker.userId, role: 'seller' }, id, 'Not my piece'),
    ).rejects.toThrow(/row-level security|permission/);
  });
});
