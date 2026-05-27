import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum CoolifySyncScope {
  Application = "application",
  Service = "service"
}

export type TCoolifySync = TRootSecretSync & {
  destination: SecretSync.Coolify;
  destinationConfig:
    | {
        scope: CoolifySyncScope.Application;
        applicationUuid: string;
        applicationName?: string | undefined;
      }
    | {
        scope: CoolifySyncScope.Service;
        serviceUuid: string;
        serviceName?: string | undefined;
      };
  connection: {
    app: AppConnection.Coolify;
    name: string;
    id: string;
  };
  syncOptions: RootSyncOptions & {
    restartOnSync?: boolean;
  };
};
