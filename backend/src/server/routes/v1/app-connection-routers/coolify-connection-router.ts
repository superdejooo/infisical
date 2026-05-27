import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCoolifyConnectionSchema,
  SanitizedCoolifyConnectionSchema,
  UpdateCoolifyConnectionSchema
} from "@app/services/app-connection/coolify";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

const CoolifyResourceSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  type: z.enum(["application", "service"])
});

// verifyAuth is typed against the base Fastify provider, while this router is registered with Zod provider types.
const jwtAuth = verifyAuth([AuthMode.JWT]) as never;

export const registerCoolifyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Coolify,
    server,
    sanitizedResponseSchema: SanitizedCoolifyConnectionSchema,
    createSchema: CreateCoolifyConnectionSchema,
    updateSchema: UpdateCoolifyConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/applications`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCoolifyApplications",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: CoolifyResourceSchema.array()
      }
    },
    onRequest: jwtAuth,
    handler: async (req) => {
      const { connectionId } = req.params;
      return server.services.appConnection.coolify.listApplications(connectionId, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/services`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCoolifyServices",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: CoolifyResourceSchema.array()
      }
    },
    onRequest: jwtAuth,
    handler: async (req) => {
      const { connectionId } = req.params;
      return server.services.appConnection.coolify.listServices(connectionId, req.permission);
    }
  });
};
