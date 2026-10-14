import "dotenv/config";
import { bootstrap } from "@/lib/bootstrap";
import { disconnectDb } from "@/lib/db";

// Seeds reference data only (assets + strategy definitions). No users, no fake market data.
bootstrap()
  .then(() => console.log("Seeded default assets and strategy definitions."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
