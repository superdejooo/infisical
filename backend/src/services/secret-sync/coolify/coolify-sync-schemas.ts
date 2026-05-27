import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { CoolifySyncScope } from "./coolify-sync-enums";

const CoolifySyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(CoolifySyncScope.Application).describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.scope),
    applicationUuid: z
      .string()
      .trim()
      .min(1, "Application UUID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.applicationUuid),
    applicationName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.applicationName)
  }),
  z.object({
    scope: z.literal(CoolifySyncScope.Service).describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.scope),
    serviceUuid: z
      .string()
      .trim()
      .min(1, "Service UUID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.serviceUuid),
    serviceName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.serviceName)
  })
]);

const CoolifySyncOptionsSchema = z.object({
  restartOnSync: z
    .boolean()
    .optional()
    .default(false)
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.COOLIFY.restartOnSync)
});

const CoolifySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const CoolifySyncSchema = BaseSecretSyncSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
)
  .extend({
    destination: z.literal(SecretSync.Coolify),
    destinationConfig: CoolifySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Coolify] }));

export const CreateCoolifySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema
});

export const UpdateCoolifySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema.optional()
});

export const CoolifySyncListItemSchema = z
  .object({
    name: z.literal("Coolify"),
    connection: z.literal(AppConnection.Coolify),
    destination: z.literal(SecretSync.Coolify),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Coolify] }));
