// Emit a finalized/reversed outcome to the customer via the EXISTING outbound
// webhook pipeline (webhook_deliveries + /api/webhooks/dispatch). We don't wire
// on-chain settlement in this pass (locked decision); a finalized OutcomeEvent
// is emitted as a signal the customer's billing system consumes.

import { db, schema } from "@/lib/db";
import type { OutcomeEventRow } from "@/lib/db/connectors";

export type EmittableStatus = "finalized" | "reversed";

export async function emitOutcome(row: OutcomeEventRow, status: EmittableStatus): Promise<void> {
  await db()
    .insert(schema.webhookDeliveries)
    .values({
      // Tenancy: customerId is the customer address, which is also the
      // tenant_settings key the dispatcher signs + delivers for.
      tenantAddress: row.customerId,
      eventType: `outcome.${status}`,
      payload: {
        id: row.id,
        customerId: row.customerId,
        connectorId: row.connectorId,
        sourceSystem: row.sourceSystem,
        eventType: row.eventType,
        entityId: row.entityId,
        occurredAt: row.occurredAt,
        confidence: row.confidence,
        billingStatus: status,
        reversalWindowExpiresAt: row.reversalWindowExpiresAt,
        normalizedFields: row.normalizedFields,
      },
      status: "pending",
      createdAtMs: Date.now(),
    });
}
