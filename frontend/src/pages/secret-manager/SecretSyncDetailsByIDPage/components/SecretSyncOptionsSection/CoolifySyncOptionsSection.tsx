import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncOptionsSection = ({ secretSync }: Props) => {
  const {
    syncOptions: { restartOnSync }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Restart Resource On Sync</DetailLabel>
      <DetailValue>
        <Badge variant={restartOnSync ? "success" : "danger"}>
          {restartOnSync ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};
