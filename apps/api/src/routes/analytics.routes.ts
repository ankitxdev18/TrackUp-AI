import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { analyticsOverviewQuerySchema } from "../analytics/analytics.schema.js";
import { getAnalyticsOverview } from "../analytics/analytics.service.js";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";

export const analyticsRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  // Enforce session authentication across all analytics endpoints
  server.addHook("preHandler", requireAuth);

  const handleOverview = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = analyticsOverviewQuerySchema.safeParse(
        request.query ?? {}
      );

      if (!parseResult.success) {
        const details = parseResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));

        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const { period } = parseResult.data;

      const data = await getAnalyticsOverview(
        user.id,
        user.timezone,
        period
      );

      return reply.status(200).send(data);
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to retrieve analytics overview");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving analytics",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  };

  server.get("/overview", handleOverview);
  server.get("/", handleOverview);
};
