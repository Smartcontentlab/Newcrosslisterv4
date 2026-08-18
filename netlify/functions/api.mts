import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import router from "../../artifacts/api-server/src/routes/index.ts";
import type { Context } from "@netlify/functions";

type LegacyHandler = (event: unknown, context: Context) => Promise<unknown>;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

const wrapped = serverless(app) as unknown as LegacyHandler;

function normalizeEvent(event: unknown) {
  if (!event || typeof event !== "object") return event;
  const input = event as {
    rawPath?: string;
    path?: string;
    httpMethod?: string;
    requestContext?: { http?: { method?: string } };
  };
  return {
    ...(event as Record<string, unknown>),
    path: input.rawPath ?? input.path ?? "/",
    httpMethod: input.requestContext?.http?.method ?? input.httpMethod ?? "GET",
  };
}

export const handler = async (event: unknown, context: Context) => wrapped(normalizeEvent(event), context);
