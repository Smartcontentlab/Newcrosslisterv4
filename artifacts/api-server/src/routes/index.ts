import { Router, type IRouter } from "express";
import healthRouter from "./health";
import itemsRouter from "./items";
import listingsRouter from "./listings";
import ordersRouter from "./orders";
import shippingRouter from "./shipping";
import analyticsRouter from "./analytics";
import aiRouter from "./ai";
import agentRouter from "./agent";
import workflowRouter from "./workflow";

const router: IRouter = Router();

router.use(healthRouter);
router.use(itemsRouter);
router.use(listingsRouter);
router.use(ordersRouter);
router.use(shippingRouter);
router.use(analyticsRouter);
router.use(aiRouter);
router.use(agentRouter);
router.use(workflowRouter);

export default router;
