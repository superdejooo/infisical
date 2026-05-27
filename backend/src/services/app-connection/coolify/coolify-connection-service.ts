import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { getCoolifyErrorMessage, listCoolifyApplications, listCoolifyServices } from "./coolify-connection-fns";
import { TCoolifyConnection } from "./coolify-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCoolifyConnection>;

export const coolifyConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listApplications = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, actor);
    try {
      return await listCoolifyApplications(appConnection, gatewayService, gatewayV2Service, gatewayPoolService);
    } catch (error) {
      logger.error(error, "Failed to list applications for Coolify connection");
      throw new BadRequestError({
        message: `Failed to list Coolify applications: ${getCoolifyErrorMessage(error)}`
      });
    }
  };

  const listServices = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, actor);
    try {
      return await listCoolifyServices(appConnection, gatewayService, gatewayV2Service, gatewayPoolService);
    } catch (error) {
      logger.error(error, "Failed to list services for Coolify connection");
      throw new BadRequestError({
        message: `Failed to list Coolify services: ${getCoolifyErrorMessage(error)}`
      });
    }
  };

  return {
    listApplications,
    listServices
  };
};
