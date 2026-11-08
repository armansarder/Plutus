// Start both services with the same existing configuration. Never handle secrets here.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localPython = join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const candidates = existsSync(localPython) ? [[localPython]] : [["python"], ["python3"], ["py", "-3"]];
const python = candidates.find(([command, ...args]) => spawnSync(command, [...args, "-c", "import uvicorn, dotenv, httpx, fastapi, pydantic"], { stdio: "ignore", windowsHide: true }).status === 0);
if (!python) {
  console.error("Backend Python dependencies are missing. Create .venv and install nemotron_agent/requirements.txt first.");
  process.exit(1);
}
const options = process.argv.slice(2);
let supported = true;
for (let i = 0; i < options.length; i += 2) {
  if (!((options[i] === "--port" && options[i + 1] === "8080") ||
        (options[i] === "--host" && ["127.0.0.1", "localhost", "0.0.0.0"].includes(options[i + 1])))) supported = false;
}
if (!supported) {
  console.error("npm run dev starts both services on 8000/8080. Use npm run dev:frontend -- <Vite options> for frontend-only work.");
  process.exit(1);
}
const [command, ...args] = python;
const child = spawn(command, [...args, join(root, "start_local.py")], { cwd: root, stdio: "inherit", windowsHide: true });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else child.kill("SIGINT");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("error", () => { console.error("Could not start the local services. Check Python and available ports."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = stopping ? 0 : (code ?? 1); });
