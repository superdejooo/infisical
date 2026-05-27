import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { TGatewayV1RelayDetails } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CoolifyConnectionMethod } from "./coolify-connection-enums";
import {
  TCoolifyConnection,
  TCoolifyConnectionConfig,
  TCoolifyResource,
  TRawCoolifyResource
} from "./coolify-connection-types";

export const normalizeCoolifyInstanceUrl = (instanceUrl: string) => removeTrailingSlash(instanceUrl.trim());

export const getCoolifyApiUrl = (
  connection: Pick<TCoolifyConnection, "credentials"> | TCoolifyConnectionConfig,
  path: string
) => {
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeCoolifyInstanceUrl(connection.credentials.instanceUrl)}/api/v1${apiPath}`;
};

const getCoolifyHeaders = (apiToken: string) => ({
  Authorization: `Bearer ${apiToken}`,
  Accept: "application/json",
  "Content-Type": "application/json"
});

const getCoolifyResponseMessage = (data: unknown): string | undefined => {
  if (!data) return undefined;
  if (typeof data === "string") return data;

  if (typeof data === "object") {
    const { message, error, errors } = data as { message?: unknown; error?: unknown; errors?: unknown };

    if (typeof message === "string") return message;
    if (typeof error === "string") return error;

    if (Array.isArray(errors)) {
      const firstMessage = errors
        .map((err) => {
          if (typeof err === "string") return err;
          if (err && typeof err === "object") return (err as { message?: unknown }).message;
          return undefined;
        })
        .find((err): err is string => typeof err === "string" && err.length > 0);

      if (firstMessage) return firstMessage;
    }
  }

  return undefined;
};

export const getCoolifyErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    return getCoolifyResponseMessage(error.response?.data) || error.message || "Unknown error";
  }

  if (error instanceof Error) {
    return error.message || "Unknown error";
  }

  return "Unknown error";
};

export const requestWithCoolifyGateway = async <T>(
  appConnection: { gatewayId?: string | null; gatewayPoolId?: string | null },
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  requestConfig: AxiosRequestConfig,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): Promise<AxiosResponse<T>> => {
  const { gatewayId: directGatewayId, gatewayPoolId } = appConnection;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "Pool-backed connections require gatewayPoolService at the call site"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  const url = new URL(requestConfig.url as string);
  await blockLocalAndPrivateIpAddresses(url.toString(), Boolean(gatewayId));

  if (!gatewayId) {
    return request.request(requestConfig);
  }

  const [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });
  // port is empty when the URL uses the protocol's default port.
  // eslint-disable-next-line no-nested-ternary
  const targetPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const hostHeader = url.port ? `${targetHost}:${url.port}` : targetHost;

  const gatewayConnectionDetailsV2 = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort
  });

  if (gatewayConnectionDetailsV2) {
    return withGatewayV2Proxy(
      async (proxyPort) => {
        const isHttps = url.protocol === "https:";

        url.host = `localhost:${proxyPort}`;

        const finalRequestConfig: AxiosRequestConfig = {
          ...requestConfig,
          url: url.toString(),
          headers: {
            ...requestConfig.headers,
            Host: hostHeader
          },
          ...(isHttps && {
            httpsAgent: new https.Agent({
              servername: targetHost
            })
          })
        };

        try {
          return await request.request(finalRequestConfig);
        } catch (error) {
          if (error instanceof AxiosError) {
            logger.error(
              { message: error.message, data: (error.response as undefined | { data: unknown })?.data },
              "Error during Coolify gateway request:"
            );
          }
          throw error;
        }
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: gatewayConnectionDetailsV2.relayHost,
        gateway: gatewayConnectionDetailsV2.gateway,
        relay: gatewayConnectionDetailsV2.relay
      }
    );
  }

  const gatewayConnectionDetailsV1: TGatewayV1RelayDetails =
    await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);

  return withGatewayProxy(
    async (proxyPort) => {
      const isHttps = url.protocol === "https:";

      url.host = `localhost:${proxyPort}`;

      const finalRequestConfig: AxiosRequestConfig = {
        ...requestConfig,
        url: url.toString(),
        headers: {
          ...requestConfig.headers,
          Host: hostHeader
        },
        ...(isHttps && {
          httpsAgent: new https.Agent({
            servername: targetHost
          })
        })
      };

      try {
        return await request.request(finalRequestConfig);
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.error(
            { message: error.message, data: (error.response as undefined | { data: unknown })?.data },
            "Error during Coolify gateway request:"
          );
        }
        throw error;
      }
    },
    {
      relayDetails: gatewayConnectionDetailsV1,
      protocol: GatewayProxyProtocol.Tcp,
      targetHost,
      targetPort
    }
  );
};

export const getCoolifyConnectionListItem = () => ({
  name: "Coolify" as const,
  app: AppConnection.Coolify as const,
  methods: Object.values(CoolifyConnectionMethod) as [CoolifyConnectionMethod.ApiToken]
});

export const validateCoolifyConnectionCredentials = async (
  config: TCoolifyConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { credentials } = config;

  try {
    await requestWithCoolifyGateway(config, gatewayService, gatewayV2Service, {
      url: getCoolifyApiUrl(config, "/version"),
      method: "GET",
      headers: getCoolifyHeaders(credentials.apiToken)
    });
  } catch (error: unknown) {
    logger.error(error, "Unable to verify Coolify connection");

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${getCoolifyErrorMessage(error)}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return credentials;
};

const mapCoolifyResources = (resources: TRawCoolifyResource[], type: TCoolifyResource["type"]): TCoolifyResource[] =>
  resources
    .filter((resource): resource is Required<Pick<TRawCoolifyResource, "uuid">> & TRawCoolifyResource =>
      Boolean(resource.uuid)
    )
    .map((resource) => ({
      uuid: resource.uuid,
      name: resource.name || resource.uuid,
      type
    }));

export const listCoolifyApplications = async (
  appConnection: TCoolifyConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const { data } = await requestWithCoolifyGateway<TRawCoolifyResource[]>(
    appConnection,
    gatewayService,
    gatewayV2Service,
    {
      url: getCoolifyApiUrl(appConnection, "/applications"),
      method: "GET",
      headers: getCoolifyHeaders(appConnection.credentials.apiToken)
    },
    gatewayPoolService
  );

  return mapCoolifyResources(data, "application");
};

export const listCoolifyServices = async (
  appConnection: TCoolifyConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const { data } = await requestWithCoolifyGateway<TRawCoolifyResource[]>(
    appConnection,
    gatewayService,
    gatewayV2Service,
    {
      url: getCoolifyApiUrl(appConnection, "/services"),
      method: "GET",
      headers: getCoolifyHeaders(appConnection.credentials.apiToken)
    },
    gatewayPoolService
  );

  return mapCoolifyResources(data, "service");
};

export const getCoolifyRequestConfig = (
  appConnection: TCoolifyConnection,
  path: string,
  config?: Omit<AxiosRequestConfig, "url">
): AxiosRequestConfig => ({
  ...config,
  url: getCoolifyApiUrl(appConnection, path),
  headers: {
    ...getCoolifyHeaders(appConnection.credentials.apiToken),
    ...config?.headers
  }
});
