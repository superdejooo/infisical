import { listCoolifyApplications, listCoolifyServices } from "./coolify-connection-fns";
import { coolifyConnectionService } from "./coolify-connection-service";

vi.mock("@app/lib/logger", () => ({
  logger: {
    error: vi.fn()
  }
}));

vi.mock("./coolify-connection-fns", () => ({
  getCoolifyErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : "Unknown error")),
  listCoolifyApplications: vi.fn(),
  listCoolifyServices: vi.fn()
}));

const listCoolifyApplicationsMock = vi.mocked(listCoolifyApplications);
const listCoolifyServicesMock = vi.mocked(listCoolifyServices);

const getAppConnection = vi.fn(async () => ({ id: "connection-1" }) as never);

const gatewayService = {
  fnGetGatewayClientTlsByGatewayId: vi.fn()
};

const gatewayV2Service = {
  getPlatformConnectionDetailsByGatewayId: vi.fn()
};

const gatewayPoolService = {
  resolveEffectiveGatewayId: vi.fn()
};

describe("Coolify connection service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("propagates application listing failures instead of returning an empty list", async () => {
    listCoolifyApplicationsMock.mockRejectedValueOnce(new Error("gateway unavailable"));
    const service = coolifyConnectionService(getAppConnection, gatewayService, gatewayV2Service, gatewayPoolService);

    await expect(service.listApplications("connection-1", {} as never)).rejects.toMatchObject({
      name: "BadRequest",
      message: "Failed to list Coolify applications: gateway unavailable"
    });
  });

  test("propagates service listing failures instead of returning an empty list", async () => {
    listCoolifyServicesMock.mockRejectedValueOnce(new Error("invalid token"));
    const service = coolifyConnectionService(getAppConnection, gatewayService, gatewayV2Service, gatewayPoolService);

    await expect(service.listServices("connection-1", {} as never)).rejects.toMatchObject({
      name: "BadRequest",
      message: "Failed to list Coolify services: invalid token"
    });
  });
});
