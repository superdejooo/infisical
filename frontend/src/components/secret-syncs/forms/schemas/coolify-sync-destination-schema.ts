import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CoolifySyncScope } from "@app/hooks/api/secretSyncs/types/coolify-sync";

export const CoolifySyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    restartOnSync: z.boolean().optional()
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.Coolify),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(CoolifySyncScope.Application),
        applicationUuid: z.string().trim().min(1, "Application is required"),
        applicationName: z.string().trim().optional()
      }),
      z.object({
        scope: z.literal(CoolifySyncScope.Service),
        serviceUuid: z.string().trim().min(1, "Service is required"),
        serviceName: z.string().trim().optional()
      })
    ])
  })
);
