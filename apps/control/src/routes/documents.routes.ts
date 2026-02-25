import { Elysia } from "elysia";
import { DocumentService } from "../services";
import type { DocumentQueryInput } from "../validators";
import {
  createDocumentSchema,
  documentIdSchema,
  documentQuerySchema,
  updateDocumentSchema,
} from "../validators";

export const documentsRoutes = new Elysia({ prefix: "/documents" })
  // List all documents
  .get(
    "/",
    async ({ query }) => {
      const documents = await DocumentService.findAll(
        query as unknown as DocumentQueryInput
      );
      return { success: true, data: documents };
    },
    { query: documentQuerySchema }
  )
  // Get document by id
  .get(
    "/:id",
    async ({ params, set }) => {
      const document = await DocumentService.findById(params.id);
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
    async ({ body, set }) => {
      try {
        const document = await DocumentService.create(body);
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
    async ({ params, body, set }) => {
      try {
        const document = await DocumentService.update(params.id, body);
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
    async ({ params, set }) => {
      try {
        await DocumentService.delete(params.id);
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
    async ({ params, set }) => {
      try {
        const document = await DocumentService.archive(params.id);
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
