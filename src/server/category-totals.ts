import "server-only";
import type pg from "pg";
import type { MovementTotal } from "../domain/movements.ts";

export async function categoryTotals(
  client: pg.PoolClient,
  ownerId: string,
  monthStart: string,
  tags: string[],
) {
  const { rows } = await client.query<
    MovementTotal & {
      categoryId: string | null;
      category: string | null;
      total: boolean;
    }
  >(
    `WITH consumption AS (
      SELECT 'expense' AS kind,b.event_id,b.currency,b.amount,b.category_id,b.effective_on
        FROM finance.budget_expenses b WHERE b.owner_id=$1
      UNION ALL
      SELECT 'income',f.id,e.currency,coalesce(a.amount,e.amount_signed),
             CASE WHEN a.event_id IS NULL THEN m.category_id ELSE a.category_id END,f.effective_on
        FROM finance.financial_events f
        JOIN finance.ordinary_movements m ON (m.owner_id,m.event_id)=(f.owner_id,f.id)
        JOIN finance.bank_effects e ON (e.owner_id,e.event_id,e.id)=(m.owner_id,m.event_id,m.event_id)
        LEFT JOIN finance.current_movement_allocations a ON (a.owner_id,a.event_id)=(f.owner_id,f.id)
       WHERE f.owner_id=$1 AND f.kind='income' AND f.status='confirmed'
      UNION ALL
      SELECT 'expense',f.id,o.currency,o.expense,NULL,f.effective_on
        FROM finance.loan_operations o
        JOIN finance.financial_events f ON (f.owner_id,f.id)=(o.owner_id,o.event_id)
       WHERE f.owner_id=$1 AND o.expense>0 AND f.status='confirmed'
    )
    SELECT x.kind,x.currency,x.category_id AS "categoryId",c.name AS category,
      grouping(x.category_id)=1 AS total,sum(x.amount)::text AS amount
      FROM consumption x
      LEFT JOIN finance.categories c ON (c.owner_id,c.id)=($1,x.category_id)
     WHERE x.effective_on >= $2::date AND x.effective_on < $2::date + interval '1 month'
       AND (cardinality($3::uuid[])=0 OR EXISTS (SELECT 1 FROM finance.current_event_tags t
         WHERE (t.owner_id,t.event_id)=($1,x.event_id) AND t.tag_id=ANY($3)))
     GROUP BY GROUPING SETS ((x.kind,x.currency,x.category_id,c.name),(x.kind,x.currency))
     ORDER BY x.kind,x.currency,total DESC,c.name NULLS LAST,x.category_id`,
    [ownerId, monthStart, tags],
  );
  return rows;
}
