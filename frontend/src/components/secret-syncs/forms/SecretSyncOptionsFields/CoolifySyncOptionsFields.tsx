import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  Label,
  Switch
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CoolifySyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();

  return (
    <Controller
      name="syncOptions.restartOnSync"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor="coolify-restart-on-sync">Restart resource on sync</Label>
              <FieldDescription>
                Coolify restarts the application or service when secrets change so new values are
                picked up immediately.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="coolify-restart-on-sync"
              variant="project"
              checked={Boolean(value)}
              onCheckedChange={onChange}
            />
          </Field>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};
