-- Real buy/sell costs per practice trade (e.g. 3 % to buy, 0.5 % to sell).
ALTER TABLE "PaperTrade" ADD COLUMN "buyCost" DOUBLE PRECISION;
ALTER TABLE "PaperTrade" ADD COLUMN "sellCost" DOUBLE PRECISION;
