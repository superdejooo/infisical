/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import {
  getCoolifyErrorMessage,
  getCoolifyRequestConfig,
  requestWithCoolifyGateway
} from "@app/services/app-connection/coolify/coolify-connection-fns";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap, TSyncSecretsResult } from "@app/services/secret-sync/secret-sync-types";

import { CoolifySyncScope } from "./coolify-sync-enums";
import { TCoolifyBulkEnvVar, TCoolifyEnvVar, TCoolifySyncWithCredentials } from "./coolify-sync-types";

type TCoolifySyncDeps = {
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type TCoolifyTarget = {
  scope: CoolifySyncScope;
  uuid: string;
  pathSegment: "applications" | "services";
};

const isNonRetryableStatus = (status: number | undefined): boolean =>
  Boolean(status && status >= 400 && status < 500 && status !== 429);

const shouldRetryCoolifyError = (error: unknown) =>
  error instanceof AxiosError ? !isNonRetryableStatus(error.response?.status) : true;

export const getCoolifyTarget = (secretSync: TCoolifySyncWithCredentials): TCoolifyTarget => {
  const { destinationConfig } = secretSync;

  switch (destinationConfig.scope) {
    case CoolifySyncScope.Application:
      return {
        scope: destinationConfig.scope,
        uuid: destinationConfig.applicationUuid,
        pathSegment: "applications"
      };
    case CoolifySyncScope.Service:
      return {
        scope: destinationConfig.scope,
        uuid: destinationConfig.serviceUuid,
        pathSegment: "services"
      };
    default:
      throw new SecretSyncError({
        message: "Unknown Coolify sync destination scope",
        shouldRetry: false
      });
  }
};

const coolifyRequest = async <T>(
  secretSync: TCoolifySyncWithCredentials,
  deps: TCoolifySyncDeps,
  path: string,
  config?: Parameters<typeof getCoolifyRequestConfig>[2]
) => {
  return requestWithCoolifyGateway<T>(
    secretSync.connection,
    deps.gatewayService,
    deps.gatewayV2Service,
    getCoolifyRequestConfig(secretSync.connection, path, config),
    deps.gatewayPoolService
  );
};

export const listCoolifyEnvVars = async (secretSync: TCoolifySyncWithCredentials, deps: TCoolifySyncDeps) => {
  const target = getCoolifyTarget(secretSync);

  try {
    const { data } = await coolifyRequest<TCoolifyEnvVar[]>(
      secretSync,
      deps,
      `/${target.pathSegment}/${target.uuid}/envs`,
      {
        method: "GET"
      }
    );

    return data;
  } catch (error) {
    throw new SecretSyncError({
      message: `Failed to list Coolify environment variables: ${getCoolifyErrorMessage(error)}`,
      error,
      shouldRetry: shouldRetryCoolifyError(error)
    });
  }
};

const bulkPatchCoolifyEnvVars = async (
  secretSync: TCoolifySyncWithCredentials,
  deps: TCoolifySyncDeps,
  data: TCoolifyBulkEnvVar[]
) => {
  if (data.length === 0) return;

  const target = getCoolifyTarget(secretSync);

  try {
    await coolifyRequest(secretSync, deps, `/${target.pathSegment}/${target.uuid}/envs/bulk`, {
      method: "PATCH",
      data: {
        data
      }
    });
  } catch (error) {
    throw new SecretSyncError({
      message: `Failed to create or update Coolify environment variables: ${getCoolifyErrorMessage(error)}`,
      error,
      shouldRetry: shouldRetryCoolifyError(error)
    });
  }
};

const deleteCoolifyEnvVar = async (
  secretSync: TCoolifySyncWithCredentials,
  deps: TCoolifySyncDeps,
  envVar: TCoolifyEnvVar
) => {
  const target = getCoolifyTarget(secretSync);

  try {
    await coolifyRequest(secretSync, deps, `/${target.pathSegment}/${target.uuid}/envs/${envVar.uuid}`, {
      method: "DELETE"
    });
  } catch (error) {
    throw new SecretSyncError({
      message: `Failed to delete Coolify environment variable ${envVar.key}: ${getCoolifyErrorMessage(error)}`,
      secretKey: envVar.key,
      error,
      shouldRetry: shouldRetryCoolifyError(error)
    });
  }
};

const restartCoolifyTarget = async (secretSync: TCoolifySyncWithCredentials, deps: TCoolifySyncDeps) => {
  const target = getCoolifyTarget(secretSync);

  try {
    await coolifyRequest(secretSync, deps, `/${target.pathSegment}/${target.uuid}/restart`, {
      method: "GET"
    });
  } catch (error) {
    throw new SecretSyncError({
      message: `Coolify secrets were synced, but failed to restart the ${target.scope}: ${getCoolifyErrorMessage(error)}`,
      error,
      shouldRetry: false
    });
  }
};

const getEnvVarValue = (envVar: TCoolifyEnvVar) => envVar.real_value ?? envVar.value ?? "";

const buildBulkEnvVar = (key: string, value: string): TCoolifyBulkEnvVar => ({
  key,
  value,
  is_preview: false,
  is_literal: true,
  is_multiline: value.includes("\n"),
  is_shown_once: false
});

export const CoolifySyncFns = {
  syncSecrets: async (
    secretSync: TCoolifySyncWithCredentials,
    secretMap: TSecretMap,
    deps: TCoolifySyncDeps
  ): Promise<TSyncSecretsResult> => {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema, restartOnSync }
    } = secretSync;

    const envVars = await listCoolifyEnvVars(secretSync, deps);
    const currentEnvMap = new Map(envVars.map((envVar) => [envVar.key, envVar]));

    const upsertPayload: TCoolifyBulkEnvVar[] = [];
    const createdSecretKeys: string[] = [];
    const updatedSecretKeys: string[] = [];
    const deletedSecretKeys: string[] = [];

    for (const [key, { value }] of Object.entries(secretMap)) {
      const current = currentEnvMap.get(key);
      if (!current || getEnvVarValue(current) !== value) {
        upsertPayload.push(buildBulkEnvVar(key, value));

        if (current) {
          updatedSecretKeys.push(key);
        } else {
          createdSecretKeys.push(key);
        }
      }
    }

    await bulkPatchCoolifyEnvVars(secretSync, deps, upsertPayload);

    if (!disableSecretDeletion) {
      for (const envVar of envVars) {
        if (matchesSchema(envVar.key, environment?.slug || "", keySchema) && !Object.hasOwn(secretMap, envVar.key)) {
          await deleteCoolifyEnvVar(secretSync, deps, envVar);
          deletedSecretKeys.push(envVar.key);
        }
      }
    }

    if (restartOnSync && createdSecretKeys.length + updatedSecretKeys.length + deletedSecretKeys.length > 0) {
      await restartCoolifyTarget(secretSync, deps);
    }

    return {
      createdSecretKeys,
      updatedSecretKeys,
      deletedSecretKeys
    };
  },

  getSecrets: async (secretSync: TCoolifySyncWithCredentials, deps: TCoolifySyncDeps): Promise<TSecretMap> => {
    const envVars = await listCoolifyEnvVars(secretSync, deps);

    return Object.fromEntries(envVars.map((envVar) => [envVar.key, { value: getEnvVarValue(envVar) }]));
  },

  removeSecrets: async (secretSync: TCoolifySyncWithCredentials, secretMap: TSecretMap, deps: TCoolifySyncDeps) => {
    const envVars = await listCoolifyEnvVars(secretSync, deps);
    let deletedCount = 0;

    for (const envVar of envVars) {
      if (Object.hasOwn(secretMap, envVar.key)) {
        await deleteCoolifyEnvVar(secretSync, deps, envVar);
        deletedCount += 1;
      }
    }

    if (secretSync.syncOptions.restartOnSync && deletedCount > 0) {
      await restartCoolifyTarget(secretSync, deps);
    }
  }
};
