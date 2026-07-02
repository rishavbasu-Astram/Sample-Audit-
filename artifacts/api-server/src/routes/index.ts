import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import assetsRouter from "./assets";
import salesRouter from "./sales";
import purchasesRouter from "./purchases";
import bankingRouter from "./banking";
import accountantRouter from "./accountant";
import controllingRouter from "./controlling";
import automationRouter from "./automation";
import remindersRouter from "./reminders";
import itemsRouter from "./items";
import taxesRouter from "./taxes";
import reportsRouter from "./reports";
import auditRouter from "./audit";
import pdfRouter from "./pdf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(assetsRouter);
router.use(salesRouter);
router.use(purchasesRouter);
router.use(bankingRouter);
router.use(accountantRouter);
router.use(controllingRouter);
router.use(automationRouter);
router.use(remindersRouter);
router.use(itemsRouter);
router.use(taxesRouter);
router.use(reportsRouter);
router.use(auditRouter);
router.use(pdfRouter);

export default router;
