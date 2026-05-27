import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CoolifyConnectionListItemSchema,
  CoolifyConnectionSchema,
  CreateCoolifyConnectionSchema,
  ValidateCoolifyConnectionCredentialsSchema
} from "./coolify-connection-schemas";

export type TCoolifyConnectionListItem = z.infer<typeof CoolifyConnectionListItemSchema>;

export type TCoolifyConnection = z.infer<typeof CoolifyConnectionSchema>;

export type TCoolifyConnectionInput = z.infer<typeof CreateCoolifyConnectionSchema> & {
  app: AppConnection.Coolify;
};

export type TValidateCoolifyConnectionCredentialsSchema = typeof ValidateCoolifyConnectionCredentialsSchema;

export type TCoolifyConnectionConfig = DiscriminativePick<
  TCoolifyConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId?: string;
  projectId?: string | null;
  version?: number;
};

export type TCoolifyResourceType = "application" | "service";

export type TCoolifyResource = {
  uuid: string;
  name: string;
  type: TCoolifyResourceType;
};

export type TRawCoolifyResource = {
  uuid?: string;
  name?: string | null;
};
