import express from "express";
import cors from "cors";
import router from "../../artifacts/api-server/src/routes/index.ts";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

export function getApp() {
  return app;
}
