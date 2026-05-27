import { requestWithCoolifyGateway } from "@app/services/app-connection/coolify/coolify-connection-fns";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";

import { CoolifySyncScope } from "./coolify-sync-enums";
import { CoolifySyncFns } from "./coolify-sync-fns";

vi.mock("@app/services/app-connection/coolify/coolify-connection-fns", () => ({
  getCoolifyRequestConfig: vi.fn((_connection: unknown, path: string, config?: Record<string, unknown>) => ({
    ...config,
    url: `https://coolify.test/api/v1${path}`
  })),
  requestWithCoolifyGateway: vi.fn()
}));

vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: vi.fn((key: string, environment: string, keySchema?: string) => {
    if (!keySchema) return true;

    const [prefix = "", suffix = ""] = keySchema.replaceAll("{{environment}}", environment).split("{{secretKey}}");

    return key.startsWith(prefix) && key.endsWith(suffix);
  })
}));

const requestWithCoolifyGatewayMock = vi.mocked(requestWithCoolifyGateway);

const deps = {
  gatewayService: {
    fnGetGatewayClientTlsByGatewayId: vi.fn()
  },
  gatewayV2Service: {
    getPlatformConnectionDetailsByGatewayId: vi.fn()
  },
  gatewayPoolService: {
    resolveEffectiveGatewayId: vi.fn()
  }
};

const buildSync = (overrides: Record<string, unknown> = {}) =>
  ({
    environment: {
      slug: "dev"
    },
    destinationConfig: {
      scope: CoolifySyncScope.Application,
      applicationUuid: "app-1"
    },
    syncOptions: {
      disableSecretDeletion: true,
      keySchema: "{{secretKey}}",
      restartOnSync: false
    },
    connection: {
      credentials: {
        instanceUrl: "https://coolify.test",
        apiToken: "token"
      },
      gatewayId: null,
      gatewayPoolId: null
    },
    ...overrides
  }) as never;

const mockCoolifyRequests = (envVars: unknown[]) => {
  requestWithCoolifyGatewayMock.mockImplementation(async (_connection, _gatewayService, _gatewayV2Service, config) => {
    const requestConfig = config as { method?: string; url: string };

    if (requestConfig.method === "GET" && requestConfig.url.endsWith("/envs")) {
      return { data: envVars } as never;
    }

    return { data: {} } as never;
  });
};

describe("Coolify sync functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates missing secrets, updates changed secrets, and skips unchanged secrets", async () => {
    mockCoolifyRequests([
      { uuid: "env-existing", key: "EXISTING", real_value: "old" },
      { uuid: "env-same", key: "SAME", real_value: "same" }
    ]);

    const result = await CoolifySyncFns.syncSecrets(
      buildSync(),
      {
        EXISTING: { value: "new" },
        SAME: { value: "same" },
        NEW: { value: "created" }
      },
      deps
    );

    expect(result).toEqual({
      createdSecretKeys: ["NEW"],
      updatedSecretKeys: ["EXISTING"],
      deletedSecretKeys: []
    });
    expect(requestWithCoolifyGatewayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        method: "PATCH",
        url: "https://coolify.test/api/v1/applications/app-1/envs/bulk",
        data: {
          data: [
            expect.objectContaining({ key: "EXISTING", value: "new" }),
            expect.objectContaining({ key: "NEW", value: "created" })
          ]
        }
      }),
      expect.anything()
    );
  });

  test("deletes stale schema-matching variables and preserves variables outside the key schema", async () => {
    mockCoolifyRequests([
      { uuid: "env-keep", key: "APP_KEEP", real_value: "keep" },
      { uuid: "env-stale", key: "APP_STALE", real_value: "stale" },
      { uuid: "env-manual", key: "MANUAL", real_value: "manual" }
    ]);

    const result = await CoolifySyncFns.syncSecrets(
      buildSync({
        syncOptions: {
          disableSecretDeletion: false,
          keySchema: "APP_{{secretKey}}",
          restartOnSync: false
        }
      }),
      {
        APP_KEEP: { value: "keep" }
      },
      deps
    );

    expect(result.deletedSecretKeys).toEqual(["APP_STALE"]);
    expect(requestWithCoolifyGatewayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        method: "DELETE",
        url: "https://coolify.test/api/v1/applications/app-1/envs/env-stale"
      }),
      expect.anything()
    );
    expect(requestWithCoolifyGatewayMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        url: "https://coolify.test/api/v1/applications/app-1/envs/env-manual"
      }),
      expect.anything()
    );
  });

  test("preserves stale variables when secret deletion is disabled", async () => {
    mockCoolifyRequests([{ uuid: "env-stale", key: "STALE", real_value: "stale" }]);

    const result = await CoolifySyncFns.syncSecrets(buildSync(), {}, deps);

    expect(result.deletedSecretKeys).toEqual([]);
    expect(requestWithCoolifyGatewayMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ method: "DELETE" }),
      expect.anything()
    );
  });

  test("imports real values with value fallback", async () => {
    mockCoolifyRequests([
      { uuid: "env-real", key: "REAL", real_value: "real", value: "masked" },
      { uuid: "env-value", key: "VALUE", value: "fallback" },
      { uuid: "env-empty", key: "EMPTY" }
    ]);

    await expect(CoolifySyncFns.getSecrets(buildSync(), deps)).resolves.toEqual({
      REAL: { value: "real" },
      VALUE: { value: "fallback" },
      EMPTY: { value: "" }
    });
  });

  test("restarts only when restartOnSync is enabled and secrets changed", async () => {
    mockCoolifyRequests([]);

    await CoolifySyncFns.syncSecrets(
      buildSync({
        syncOptions: {
          disableSecretDeletion: true,
          keySchema: "{{secretKey}}",
          restartOnSync: true
        }
      }),
      { NEW: { value: "created" } },
      deps
    );

    expect(requestWithCoolifyGatewayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        method: "GET",
        url: "https://coolify.test/api/v1/applications/app-1/restart"
      }),
      expect.anything()
    );

    vi.clearAllMocks();
    mockCoolifyRequests([{ uuid: "env-same", key: "SAME", real_value: "same" }]);

    await CoolifySyncFns.syncSecrets(
      buildSync({
        syncOptions: {
          disableSecretDeletion: true,
          keySchema: "{{secretKey}}",
          restartOnSync: true
        }
      }),
      { SAME: { value: "same" } },
      deps
    );

    expect(requestWithCoolifyGatewayMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        url: "https://coolify.test/api/v1/applications/app-1/restart"
      }),
      expect.anything()
    );
  });

  test("removeSecrets deletes only requested keys and restarts when configured", async () => {
    mockCoolifyRequests([
      { uuid: "env-a", key: "A", real_value: "1" },
      { uuid: "env-b", key: "B", real_value: "2" }
    ]);

    await CoolifySyncFns.removeSecrets(
      buildSync({
        syncOptions: {
          restartOnSync: true
        }
      }),
      {
        A: { value: "1" },
        C: { value: "3" }
      },
      deps
    );

    expect(requestWithCoolifyGatewayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        method: "DELETE",
        url: "https://coolify.test/api/v1/applications/app-1/envs/env-a"
      }),
      expect.anything()
    );
    expect(requestWithCoolifyGatewayMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        url: "https://coolify.test/api/v1/applications/app-1/envs/env-b"
      }),
      expect.anything()
    );
    expect(requestWithCoolifyGatewayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        method: "GET",
        url: "https://coolify.test/api/v1/applications/app-1/restart"
      }),
      expect.anything()
    );
  });

  test("wraps per-secret delete failures with SecretSyncError", async () => {
    requestWithCoolifyGatewayMock.mockImplementation(
      async (_connection, _gatewayService, _gatewayV2Service, config) => {
        const requestConfig = config as { method?: string; url: string };

        if (requestConfig.method === "GET" && requestConfig.url.endsWith("/envs")) {
          return { data: [{ uuid: "env-stale", key: "STALE", real_value: "stale" }] } as never;
        }

        if (requestConfig.method === "DELETE") {
          throw new Error("delete failed");
        }

        return { data: {} } as never;
      }
    );

    await expect(
      CoolifySyncFns.syncSecrets(
        buildSync({
          syncOptions: {
            disableSecretDeletion: false,
            keySchema: "{{secretKey}}",
            restartOnSync: false
          }
        }),
        {},
        deps
      )
    ).rejects.toMatchObject({
      name: "SecretSyncError",
      secretKey: "STALE"
    });
    await expect(
      CoolifySyncFns.syncSecrets(
        buildSync({
          syncOptions: {
            disableSecretDeletion: false,
            keySchema: "{{secretKey}}",
            restartOnSync: false
          }
        }),
        {},
        deps
      )
    ).rejects.toBeInstanceOf(SecretSyncError);
  });
});
