import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { CoolifyConnectionMethod } from "./coolify-connection-enums";

const InstanceUrlSchema = z
  .string()
  .trim()
  .min(1, "Instance URL required")
  .url("Invalid Instance URL")
  .describe(AppConnections.CREDENTIALS.COOLIFY.instanceUrl);

export const CoolifyConnectionApiTokenCredentialsSchema = z.object({
  instanceUrl: InstanceUrlSchema,
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.COOLIFY.apiToken)
});

const BaseCoolifyConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Coolify) });

export const CoolifyConnectionSchema = BaseCoolifyConnectionSchema.extend({
  method: z.literal(CoolifyConnectionMethod.ApiToken),
  credentials: CoolifyConnectionApiTokenCredentialsSchema
});

export const SanitizedCoolifyConnectionSchema = z.discriminatedUnion("method", [
  BaseCoolifyConnectionSchema.extend({
    method: z.literal(CoolifyConnectionMethod.ApiToken),
    credentials: CoolifyConnectionApiTokenCredentialsSchema.pick({
      instanceUrl: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Coolify]} (API Token)` }))
]);

export const ValidateCoolifyConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(CoolifyConnectionMethod.ApiToken).describe(AppConnections.CREATE(AppConnection.Coolify).method),
    credentials: CoolifyConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Coolify).credentials
    )
  })
]);

export const CreateCoolifyConnectionSchema = ValidateCoolifyConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Coolify, { supportsGateways: true })
);

export const UpdateCoolifyConnectionSchema = z
  .object({
    credentials: CoolifyConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Coolify).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Coolify, { supportsGateways: true }));

export const CoolifyConnectionListItemSchema = z
  .object({
    name: z.literal("Coolify"),
    app: z.literal(AppConnection.Coolify),
    methods: z.nativeEnum(CoolifyConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Coolify] }));
