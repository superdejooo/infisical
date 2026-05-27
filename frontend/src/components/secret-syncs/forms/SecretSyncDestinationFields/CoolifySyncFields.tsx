import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { COOLIFY_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import {
  TCoolifyResource,
  useListCoolifyApplications,
  useListCoolifyServices
} from "@app/hooks/api/appConnections/coolify";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CoolifySyncScope } from "@app/hooks/api/secretSyncs/types/coolify-sync";

import { TSecretSyncForm } from "../schemas";

export const CoolifySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Coolify }
  >();
  const [isManualUuid, setIsManualUuid] = useState(false);

  const connectionId = useWatch({ name: "connection.id", control });
  const selectedScope = useWatch({ name: "destinationConfig.scope", control });
  const isApplicationScope = selectedScope !== CoolifySyncScope.Service;

  const { data: applications = [], isPending: isApplicationsPending } = useListCoolifyApplications(
    connectionId,
    {
      enabled: Boolean(connectionId) && isApplicationScope && !isManualUuid
    }
  );

  const { data: services = [], isPending: isServicesPending } = useListCoolifyServices(
    connectionId,
    {
      enabled: Boolean(connectionId) && !isApplicationScope && !isManualUuid
    }
  );

  const clearTarget = () => {
    setValue("destinationConfig.applicationUuid", "");
    setValue("destinationConfig.applicationName", "");
    setValue("destinationConfig.serviceUuid", "");
    setValue("destinationConfig.serviceName", "");
  };

  const resources = isApplicationScope ? applications : services;
  const isLoadingResources =
    Boolean(connectionId) && (isApplicationScope ? isApplicationsPending : isServicesPending);
  const targetFieldName: "destinationConfig.applicationUuid" | "destinationConfig.serviceUuid" =
    isApplicationScope ? "destinationConfig.applicationUuid" : "destinationConfig.serviceUuid";
  const targetNameFieldName: "destinationConfig.applicationName" | "destinationConfig.serviceName" =
    isApplicationScope ? "destinationConfig.applicationName" : "destinationConfig.serviceName";

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", CoolifySyncScope.Application);
          clearTarget();
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={CoolifySyncScope.Application}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Resource Type
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-lg">
                  <div className="flex flex-col gap-3">
                    <p>Specify which Coolify resource should receive synced secrets.</p>
                    <ul className="flex list-disc flex-col gap-3 pl-4">
                      {Object.values(COOLIFY_SYNC_SCOPES).map(({ name, description }) => (
                        <li key={name}>
                          <p className="text-mineshaft-300">
                            <span className="font-medium text-bunker-200">{name}</span>:{" "}
                            {description}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Select
                value={value ?? CoolifySyncScope.Application}
                onValueChange={(val) => {
                  onChange(val);
                  setIsManualUuid(false);
                  clearTarget();
                }}
              >
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a resource type..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.entries(COOLIFY_SYNC_SCOPES).map(([scope, { name }]) => (
                    <SelectItem value={scope} key={scope}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Field orientation="horizontal">
        <FieldContent>
          <Label htmlFor="coolify-manual-uuid">Enter UUID manually</Label>
          <FieldDescription>
            Use this when the target is not returned by the Coolify resource list.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="coolify-manual-uuid"
          variant="project"
          checked={isManualUuid}
          onCheckedChange={(checked) => {
            setIsManualUuid(checked);
            clearTarget();
          }}
        />
      </Field>
      <Controller
        name={targetFieldName}
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>{isApplicationScope ? "Application" : "Service"}</FieldLabel>
            <FieldContent>
              {isManualUuid ? (
                <Input
                  value={value ?? ""}
                  onChange={(e) => {
                    onChange(e.target.value);
                    setValue(targetNameFieldName, "");
                  }}
                  placeholder={
                    isApplicationScope
                      ? "Enter Coolify application UUID..."
                      : "Enter Coolify service UUID..."
                  }
                  isError={Boolean(error)}
                />
              ) : (
                <FilterableSelect
                  isLoading={isLoadingResources}
                  isDisabled={!connectionId}
                  value={resources.find((resource) => resource.uuid === value) ?? null}
                  onChange={(option) => {
                    const selected = option as SingleValue<TCoolifyResource>;
                    onChange(selected?.uuid ?? null);
                    setValue(targetNameFieldName, selected?.name ?? "");
                  }}
                  options={resources}
                  placeholder={
                    isApplicationScope ? "Select an application..." : "Select a service..."
                  }
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.uuid}
                />
              )}
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
