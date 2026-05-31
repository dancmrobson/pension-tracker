import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pensionRouter from "./pension";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pensionRouter);

export default router;
