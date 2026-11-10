import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Item photos (and photo-reading JPEGs) travel in the request body; Vercel itself caps requests at 4.5 MB.
app.use(express.json({ limit: "4.5mb" }));
app.use(express.urlencoded({ extended: true, limit: "4.5mb" }));

app.use("/api", router);

/**
 * Express 5 forwards rejected promises from async handlers here. Without this,
 * a failure is logged as whatever the library chose to say — drizzle, for one,
 * reports "Failed query" and hides the driver error underneath it, which makes a
 * wrong password indistinguishable from an unreachable host. Logging `cause`
 * keeps the detail that actually identifies the problem.
 */
app.use((error: Error & { code?: string; cause?: unknown }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const cause = error.cause as (Error & { code?: string }) | undefined;
  logger.error(
    {
      message: error.message,
      code: error.code,
      causeMessage: cause?.message,
      causeCode: cause?.code,
    },
    "request failed",
  );
  if (response.headersSent) return;
  // Body-parser errors (too large, malformed JSON) carry their own 4xx status.
  const status = (error as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    response.status(status).json({ error: status === 413 ? "This request is too large. Remove a photo or two and try again." : error.message });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
});

export default app;
