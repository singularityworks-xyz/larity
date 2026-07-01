import { Elysia } from "elysia";
import { requireOrg } from "../middleware/auth";
import { DocumentService } from "../services";
import type { DocumentQueryInput } from "../validators";
import {
  createDocumentSchema,
  documentIdSchema,
  documentQuerySchema,
  updateDocumentSchema,
} from "../validators";

export const documentsRoutes = new Elysia({ prefix: "/documents" })
  .use(requireOrg)
  // List all documents
  .get(
    "/",
    async ({ query, user }) => {
      const documents = await DocumentService.findAll(
        user?.orgId!,
        query as unknown as DocumentQueryInput
      );
      return { success: true, data: documents };
    },
    { query: documentQuerySchema }
  )
  // Get document by id
  .get(
    "/:id",
    async ({ params, set, user }) => {
      const document = await DocumentService.findById(params.id, user?.orgId!);
      if (!document) {
        set.status = 404;
        return { success: false, error: "Document not found" };
      }
      return { success: true, data: document };
    },
    { params: documentIdSchema }
  )
  // Create document
  .post(
    "/",
    async ({ body, set, user }) => {
      try {
        const document = await DocumentService.create(user?.orgId!, body);
        return { success: true, data: document };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2003") {
          set.status = 400;
          return {
            success: false,
            error: "Invalid reference (client, creator, or parent)",
          };
        }
        throw e;
      }
    },
    { body: createDocumentSchema }
  )
  // Update document
  .patch(
    "/:id",
    async ({ params, body, set, user }) => {
      try {
        const document = await DocumentService.update(
          params.id,
          user?.orgId!,
          body
        );
        return { success: true, data: document };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Document not found" };
        }
        throw e;
      }
    },
    { params: documentIdSchema, body: updateDocumentSchema }
  )
  // Delete document
  .delete(
    "/:id",
    async ({ params, set, user }) => {
      try {
        await DocumentService.delete(params.id, user?.orgId!);
        return { success: true, message: "Document deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Document not found" };
        }
        throw e;
      }
    },
    { params: documentIdSchema }
  )
  // Archive document
  .post(
    "/:id/archive",
    async ({ params, set, user }) => {
      try {
        const document = await DocumentService.archive(params.id, user?.orgId!);
        return { success: true, data: document };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Document not found" };
        }
        throw e;
      }
    },
    { params: documentIdSchema }
  );
