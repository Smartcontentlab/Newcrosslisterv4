import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import itemsRouter from "./items";
import listingsRouter from "./listings";
import ordersRouter from "./orders";
import shippingRouter from "./shipping";
import analyticsRouter from "./analytics";
import aiRouter from "./ai";
import agentRouter from "./agent";
import workflowRouter from "./workflow";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Health must remain public so Netlify and deployment monitors can verify the function.
router.use(healthRouter);
router.use(authRouter);

// Every business route requires a verified Supabase access token. Individual routes also
// filter every database query by the trusted identity stored in response.locals.authUser.
router.use(requireAuth);
router.use(itemsRouter);
router.use(listingsRouter);
router.use(ordersRouter);
router.use(shippingRouter);
router.use(analyticsRouter);
router.use(aiRouter);
router.use(agentRouter);
router.use(workflowRouter);

export default router;
