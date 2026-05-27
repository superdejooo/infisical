import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCoolifyResource } from "./types";

const coolifyConnectionKeys = {
  all: [...appConnectionKeys.all, "coolify"] as const,
  listApplications: (connectionId: string) =>
    [...coolifyConnectionKeys.all, "applications", connectionId] as const,
  listServices: (connectionId: string) =>
    [...coolifyConnectionKeys.all, "services", connectionId] as const
};

export const useListCoolifyApplications = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCoolifyResource[],
      unknown,
      TCoolifyResource[],
      ReturnType<typeof coolifyConnectionKeys.listApplications>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: coolifyConnectionKeys.listApplications(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCoolifyResource[]>(
        `/api/v1/app-connections/coolify/${connectionId}/applications`
      );

      return data;
    },
    ...options
  });
};

export const useListCoolifyServices = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCoolifyResource[],
      unknown,
      TCoolifyResource[],
      ReturnType<typeof coolifyConnectionKeys.listServices>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: coolifyConnectionKeys.listServices(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCoolifyResource[]>(
        `/api/v1/app-connections/coolify/${connectionId}/services`
      );

      return data;
    },
    ...options
  });
};
