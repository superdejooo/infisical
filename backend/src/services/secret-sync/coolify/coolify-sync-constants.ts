import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const COOLIFY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Coolify",
  connection: AppConnection.Coolify,
  destination: SecretSync.Coolify,
  canImportSecrets: true,
  canRemoveSecretsOnDeletion: true
};
