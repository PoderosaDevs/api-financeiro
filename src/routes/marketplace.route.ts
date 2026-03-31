import { Router, Request, Response } from "express";
import * as marketplaceService from "../services/marketplace.service";
import { ensureAuthenticated } from "../middlewares/auth.middleware";

export const marketplaceRoutes = Router();

marketplaceRoutes.get("/", async (req: Request, res: Response) => {
  const marketplaces = await marketplaceService.getAllMarketplaces();
  return res.json(marketplaces);
});

marketplaceRoutes.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const marketplace = await marketplaceService.getMarketplaceById(id as string);
    return res.json(marketplace);
  } catch (error: any) {
    return res.status(404).json({ message: error.message });
  }
});

marketplaceRoutes.post(
  "/",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { titulo, freteParte } = req.body;

      const marketplace = await marketplaceService.createMarketplace(
        titulo,
        freteParte,
      );
      return res.status(201).json(marketplace);
    } catch (error: any) {
      return res.status(500).json({
        error: "Erro interno",
        message: error.message,
      });
    }
  },
);

marketplaceRoutes.put(
  "/:id",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { titulo, freteParte } = req.body;

      const updated = await marketplaceService.updateMarketplace(
        id as string,
        titulo,
        freteParte
      );
      return res.json(updated);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  },
);

marketplaceRoutes.delete(
  "/:id",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await marketplaceService.deleteMarketplace(id as string);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  },
);