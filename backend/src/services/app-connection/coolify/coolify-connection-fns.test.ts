import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { CoolifyConnectionMethod } from "./coolify-connection-enums";
import {
  getCoolifyApiUrl,
  listCoolifyApplications,
  listCoolifyServices,
  requestWithCoolifyGateway,
  validateCoolifyConnectionCredentials
} from "./coolify-connection-fns";

vi.mock("@app/lib/config/request", () => ({
  request: {
    request: vi.fn()
  }
}));

vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: vi.fn()
}));

vi.mock("@app/lib/logger", () => ({
  logger: {
    error: vi.fn()
  }
}));

vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async ({ host }: { host: string }) => [host])
}));

vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({
  withGatewayV2Proxy: vi.fn(async (callback: (proxyPort: number) => unknown) => callback(12345))
}));

vi.mock("@app/lib/gateway", () => ({
  GatewayProxyProtocol: {
    Tcp: "tcp"
  },
  withGatewayProxy: vi.fn(async (callback: (proxyPort: number) => unknown) => callback(23456))
}));

// eslint-disable-next-line @typescript-eslint/unbound-method
const requestMock = vi.mocked(request.request);
const blockLocalAndPrivateIpAddressesMock = vi.mocked(blockLocalAndPrivateIpAddresses);

const gatewayService = {
  fnGetGatewayClientTlsByGatewayId: vi.fn()
};

const gatewayV2Service = {
  getPlatformConnectionDetailsByGatewayId: vi.fn()
};

const gatewayPoolService = {
  resolveEffectiveGatewayId: vi.fn()
};

const buildConnection = (overrides: Record<string, unknown> = {}) =>
  ({
    app: "coolify",
    method: CoolifyConnectionMethod.ApiToken,
    credentials: {
      instanceUrl: "https://coolify.example.com/",
      apiToken: "token"
    },
    gatewayId: null,
    gatewayPoolId: null,
    ...overrides
  }) as never;

const buildAxiosError = (message: string, data: unknown, status = 400) =>
  new AxiosError(message, undefined, undefined, undefined, {
    data,
    status,
    statusText: "Error",
    headers: {},
    config: {} as never
  } as never);

describe("Coolify connection functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMock.mockResolvedValue({ data: "4.0.0" });
  });

  test("normalizes trailing slashes when building API URLs", () => {
    expect(getCoolifyApiUrl(buildConnection(), "/version")).toBe("https://coolify.example.com/api/v1/version");
  });

  test("validates credentials through the Coolify version endpoint", async () => {
    await validateCoolifyConnectionCredentials(buildConnection(), gatewayService, gatewayV2Service);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://coolify.example.com/api/v1/version",
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token"
        }) as unknown
      })
    );
  });

  test("surfaces Coolify response messages when credential validation fails", async () => {
    requestMock.mockRejectedValueOnce(
      buildAxiosError("Request failed with status code 401", { message: "Invalid API token" }, 401)
    );

    await expect(
      validateCoolifyConnectionCredentials(buildConnection(), gatewayService, gatewayV2Service)
    ).rejects.toMatchObject({
      name: "BadRequest",
      message: "Failed to validate credentials: Invalid API token"
    });
  });

  test("lists applications and maps compact resource fields", async () => {
    requestMock.mockResolvedValueOnce({
      data: [{ uuid: "app-1", name: "API" }, { uuid: "app-2" }, { name: "missing uuid" }]
    });

    await expect(
      listCoolifyApplications(buildConnection(), gatewayService, gatewayV2Service, gatewayPoolService)
    ).resolves.toEqual([
      { uuid: "app-1", name: "API", type: "application" },
      { uuid: "app-2", name: "app-2", type: "application" }
    ]);
  });

  test("lists services and maps compact resource fields", async () => {
    requestMock.mockResolvedValueOnce({
      data: [{ uuid: "service-1", name: "Postgres" }]
    });

    await expect(
      listCoolifyServices(buildConnection(), gatewayService, gatewayV2Service, gatewayPoolService)
    ).resolves.toEqual([{ uuid: "service-1", name: "Postgres", type: "service" }]);
  });

  test("resolves gateway pools before making a gateway-backed request", async () => {
    gatewayPoolService.resolveEffectiveGatewayId.mockResolvedValueOnce("gateway-1");
    gatewayV2Service.getPlatformConnectionDetailsByGatewayId.mockResolvedValueOnce({
      relayHost: "relay.example.com",
      gateway: {},
      relay: {}
    });
    requestMock.mockResolvedValueOnce({ data: [] });

    await listCoolifyApplications(
      buildConnection({
        gatewayPoolId: "pool-1"
      }),
      gatewayService,
      gatewayV2Service,
      gatewayPoolService
    );

    expect(gatewayPoolService.resolveEffectiveGatewayId).toHaveBeenCalledWith({
      gatewayId: null,
      gatewayPoolId: "pool-1"
    });
    expect(blockLocalAndPrivateIpAddressesMock).toHaveBeenCalledWith(
      "https://coolify.example.com/api/v1/applications",
      true
    );
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://localhost:12345/api/v1/applications",
        headers: expect.objectContaining({
          Host: "coolify.example.com"
        }) as unknown
      })
    );
  });

  test("preserves HTTP protocol through v1 gateway requests", async () => {
    gatewayV2Service.getPlatformConnectionDetailsByGatewayId.mockResolvedValueOnce(null);
    requestMock.mockResolvedValueOnce({ data: [] });

    await requestWithCoolifyGateway(
      {
        gatewayId: "gateway-1",
        gatewayPoolId: null
      },
      gatewayService,
      gatewayV2Service,
      {
        url: "http://coolify.example.com:3000/api/v1/applications",
        method: "GET"
      }
    );

    expect(gatewayV2Service.getPlatformConnectionDetailsByGatewayId).toHaveBeenCalledWith({
      gatewayId: "gateway-1",
      targetHost: "coolify.example.com",
      targetPort: 3000
    });

    const finalRequestConfig = requestMock.mock.calls[0][0] as { url: string; httpsAgent?: unknown };
    expect(finalRequestConfig.url).toBe("http://localhost:23456/api/v1/applications");
    expect(finalRequestConfig.httpsAgent).toBeUndefined();
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Host: "coolify.example.com:3000"
        }) as unknown
      })
    );
  });
});
