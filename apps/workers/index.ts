import { startWorkersApp } from "./src/index";

startWorkersApp().catch((error) => {
  console.error("FATAL: Workers startup failed", error);
  process.exit(1);
});
