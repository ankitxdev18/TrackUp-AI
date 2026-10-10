import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "../notifications/notification.schema.js";
import {
  getUnreadNotificationCount,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../notifications/notification.service.js";

export const notificationRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  server.addHook("preHandler", requireAuth);

  // GET /api/notifications — Retrieve current user's notifications
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = listNotificationsQuerySchema.safeParse(request.query);
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

      const { limit, unreadOnly } = parseResult.data;
      const items = await getUserNotifications(user.id, {
        limit,
        unreadOnly: unreadOnly === "true",
      });

      return reply.status(200).send({
        notifications: items,
        total: items.length,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to list notifications");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving notifications",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/notifications/unread-count — Retrieve unread badge count
  server.get("/unread-count", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      const count = await getUnreadNotificationCount(user.id);

      return reply.status(200).send({
        count,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to retrieve unread notification count");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving notification count",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/notifications/:id/read — Mark single notification as read
  server.patch("/:id/read", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = notificationIdParamSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Invalid notification ID format",
          code: "INVALID_ID",
        });
      }

      const updated = await markNotificationAsRead(
        user.id,
        parseResult.data.id
      );

      if (!updated) {
        return reply.status(404).send({
          error: "Notification not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        notification: updated,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to mark notification as read");
      return reply.status(500).send({
        error: "An unexpected error occurred while marking notification as read",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/notifications/mark-all-read — Bulk mark all unread notifications as read
  server.post("/mark-all-read", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      const markedCount = await markAllNotificationsAsRead(user.id);

      return reply.status(200).send({
        success: true,
        markedCount,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to mark all notifications as read");
      return reply.status(500).send({
        error: "An unexpected error occurred while marking all notifications as read",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
