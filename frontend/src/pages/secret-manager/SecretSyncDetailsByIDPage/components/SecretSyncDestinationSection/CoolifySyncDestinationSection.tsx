import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { COOLIFY_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import { CoolifySyncScope, TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Resource Type</DetailLabel>
        <DetailValue>{COOLIFY_SYNC_SCOPES[destinationConfig.scope].name}</DetailValue>
      </Detail>
      {destinationConfig.scope === CoolifySyncScope.Application ? (
        <Detail>
          <DetailLabel>Application</DetailLabel>
          <DetailValue>
            {destinationConfig.applicationName || destinationConfig.applicationUuid}
          </DetailValue>
        </Detail>
      ) : (
        <Detail>
          <DetailLabel>Service</DetailLabel>
          <DetailValue>
            {destinationConfig.serviceName || destinationConfig.serviceUuid}
          </DetailValue>
        </Detail>
      )}
    </>
  );
};
