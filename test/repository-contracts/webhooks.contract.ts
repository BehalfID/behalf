import { expect, it } from "vitest";
import { createPublicId } from "@/lib/ids";
import type {
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
  WebhookEventRecord
} from "@/lib/repositories/webhooks";
import { repositoryContractSuite } from "./contractHarness";

export type WebhookRepositoryContract = {
  createWebhookEndpoint: (input: {
    webhookId: string;
    accountId: string;
    developerUserId?: string | null;
    url: string;
    secretHash: string;
    secretPreview: string;
    events: string[];
  }) => Promise<WebhookEndpointRecord>;
  findActiveWebhookEndpointsForEvent: (input: {
    accountId?: string | null;
    developerUserId?: string | null;
    eventType: string;
  }) => Promise<WebhookEndpointRecord[]>;
  updateWebhookEndpointStatus: (
    webhookId: string,
    accountId: string,
    status: "active" | "disabled"
  ) => Promise<unknown>;
  enqueueWebhookEventRecord: (input: {
    eventId: string;
    accountId: string;
    developerUserId?: string | null;
    type: string;
    payload: Record<string, unknown>;
  }) => Promise<WebhookEventRecord>;
  claimNextWebhookEvent: (now?: Date, maxAttempts?: number) => Promise<WebhookEventRecord | null>;
  markWebhookEventCompleted: (eventId: string) => Promise<unknown>;
  markWebhookEventDeadLetter: (eventId: string, lastError: string) => Promise<unknown>;
  countPendingWebhookEvents: (scope: {
    accountId?: string;
    developerUserId?: string;
  }) => Promise<number>;
  countDeadLetterWebhookEvents: (scope: {
    accountId?: string;
    developerUserId?: string;
  }) => Promise<number>;
  insertWebhookDeliveries: (rows: WebhookDeliveryRecord[]) => Promise<WebhookDeliveryRecord[]>;
  findWebhookDeliveriesByWebhook: (
    webhookId: string,
    scope: { accountId?: string; developerUserId?: string },
    options?: { limit?: number }
  ) => Promise<WebhookDeliveryRecord[]>;
};

export type WebhookContractDeps = WebhookRepositoryContract & {
  seedAccount: (accountId?: string) => Promise<{ accountId: string }>;
};

export function makeWebhookRepositoryContract(
  name: string,
  factory: () => WebhookContractDeps | Promise<WebhookContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("createWebhookEndpoint and findActiveWebhookEndpointsForEvent match event type", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_wh_active");
      await deps.createWebhookEndpoint({
        webhookId: "wh_active",
        accountId,
        url: "https://example.com/hooks",
        secretHash: "hash_active",
        secretPreview: "bhf_wh_...active",
        events: ["verification.allowed", "agent.created"]
      });
      await deps.createWebhookEndpoint({
        webhookId: "wh_other",
        accountId,
        url: "https://example.com/other",
        secretHash: "hash_other",
        secretPreview: "bhf_wh_...other",
        events: ["agent.created"]
      });

      const matches = await deps.findActiveWebhookEndpointsForEvent({
        accountId,
        eventType: "verification.allowed"
      });

      expect(matches.map((row) => row.webhookId)).toEqual(["wh_active"]);
      expect(matches[0]?.secretHash).toBeTruthy();
    });

    it("disabled endpoints are excluded from active fan-out", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_wh_disabled");
      await deps.createWebhookEndpoint({
        webhookId: "wh_disabled",
        accountId,
        url: "https://example.com/disabled",
        secretHash: "hash_disabled",
        secretPreview: "bhf_wh_...disabled",
        events: ["verification.denied"]
      });
      await deps.updateWebhookEndpointStatus("wh_disabled", accountId, "disabled");

      const matches = await deps.findActiveWebhookEndpointsForEvent({
        accountId,
        eventType: "verification.denied"
      });

      expect(matches).toEqual([]);
    });

    it("enqueue + claimNextWebhookEvent atomically moves pending to processing", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_wh_claim");
      await deps.enqueueWebhookEventRecord({
        eventId: "evt_claim",
        accountId,
        type: "agent.created",
        payload: { eventId: "evt_claim", type: "agent.created" }
      });

      expect(await deps.countPendingWebhookEvents({ accountId })).toBe(1);

      const claimed = await deps.claimNextWebhookEvent(new Date());
      const claimedAgain = await deps.claimNextWebhookEvent(new Date());

      expect(claimed?.eventId).toBe("evt_claim");
      expect(claimed?.status).toBe("processing");
      expect(claimed?.attempts).toBe(1);
      expect(claimedAgain).toBeNull();
      expect(await deps.countPendingWebhookEvents({ accountId })).toBe(0);
    });

    it("markWebhookEventCompleted and dead-letter update counts", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_wh_complete");
      await deps.enqueueWebhookEventRecord({
        eventId: "evt_complete",
        accountId,
        type: "permission.created",
        payload: { eventId: "evt_complete" }
      });
      const claimed = await deps.claimNextWebhookEvent(new Date());
      await deps.markWebhookEventCompleted(claimed!.eventId);

      await deps.enqueueWebhookEventRecord({
        eventId: "evt_dead",
        accountId,
        type: "permission.revoked",
        payload: { eventId: "evt_dead" }
      });
      const dead = await deps.claimNextWebhookEvent(new Date());
      await deps.markWebhookEventDeadLetter(dead!.eventId, "max attempts");

      expect(await deps.countPendingWebhookEvents({ accountId })).toBe(0);
      expect(await deps.countDeadLetterWebhookEvents({ accountId })).toBe(1);
    });

    it("insertWebhookDeliveries and findWebhookDeliveriesByWebhook return newest first", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_wh_delivery");
      await deps.createWebhookEndpoint({
        webhookId: "wh_delivery",
        accountId,
        url: "https://example.com/delivery",
        secretHash: "hash_delivery",
        secretPreview: "bhf_wh_...delivery",
        events: ["agent.enabled"]
      });

      await deps.insertWebhookDeliveries([
        {
          deliveryId: createPublicId("dlv"),
          accountId,
          webhookId: "wh_delivery",
          eventId: "evt_old",
          eventType: "agent.enabled",
          status: "failed",
          attempt: 1,
          maxAttempts: 5
        }
      ]);
      await deps.insertWebhookDeliveries([
        {
          deliveryId: createPublicId("dlv"),
          accountId,
          webhookId: "wh_delivery",
          eventId: "evt_new",
          eventType: "agent.enabled",
          status: "success",
          httpStatus: 200,
          attempt: 1,
          maxAttempts: 5
        }
      ]);

      const deliveries = await deps.findWebhookDeliveriesByWebhook("wh_delivery", { accountId });
      expect(deliveries.map((row) => row.eventId).sort()).toEqual(["evt_new", "evt_old"]);
      expect(deliveries[0]?.eventId).toBe("evt_new");
    });
  });
}
