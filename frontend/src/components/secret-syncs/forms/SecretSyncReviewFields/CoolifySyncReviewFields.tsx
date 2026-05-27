import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { COOLIFY_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CoolifySyncScope } from "@app/hooks/api/secretSyncs/types/coolify-sync";

export const CoolifySyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();

  const [{ restartOnSync }] = watch(["syncOptions"]);

  return (
    <Detail>
      <DetailLabel>Restart Resource</DetailLabel>
      <DetailValue>
        <Badge variant={restartOnSync ? "success" : "danger"}>
          {restartOnSync ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};

export const CoolifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();
  const config = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Resource Type</DetailLabel>
        <DetailValue>{COOLIFY_SYNC_SCOPES[config.scope].name}</DetailValue>
      </Detail>
      {config.scope === CoolifySyncScope.Application ? (
        <Detail>
          <DetailLabel>Application</DetailLabel>
          <DetailValue>{config.applicationName || config.applicationUuid}</DetailValue>
        </Detail>
      ) : (
        <Detail>
          <DetailLabel>Service</DetailLabel>
          <DetailValue>{config.serviceName || config.serviceUuid}</DetailValue>
        </Detail>
      )}
    </>
  );
};
