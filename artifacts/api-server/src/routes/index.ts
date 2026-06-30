import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import assetsRouter from "./assets";
import salesRouter from "./sales";
import purchasesRouter from "./purchases";
import bankingRouter from "./banking";
import accountantRouter from "./accountant";
import pdfRouter from "./pdf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(assetsRouter);
router.use(salesRouter);
router.use(purchasesRouter);
router.use(bankingRouter);
router.use(accountantRouter);
router.use(pdfRouter);

export default router;
