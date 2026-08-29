import createCalculatorServer from "./calculator-server.js";

await createCalculatorServer().serveStdio();
