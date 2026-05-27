import z from "zod";

import { TCoolifyConnection } from "@app/services/app-connection/coolify";

import { CoolifySyncListItemSchema, CoolifySyncSchema, CreateCoolifySyncSchema } from "./coolify-sync-schemas";

export type TCoolifySyncListItem = z.infer<typeof CoolifySyncListItemSchema>;

export type TCoolifySync = z.infer<typeof CoolifySyncSchema>;

export type TCoolifySyncInput = z.infer<typeof CreateCoolifySyncSchema>;

export type TCoolifySyncWithCredentials = TCoolifySync & {
  connection: TCoolifyConnection;
};

export type TCoolifyEnvVar = {
  uuid: string;
  key: string;
  value?: string | null;
  real_value?: string | null;
};

export type TCoolifyBulkEnvVar = {
  key: string;
  value: string;
  is_preview: false;
  is_literal: true;
  is_multiline: boolean;
  is_shown_once: false;
};
