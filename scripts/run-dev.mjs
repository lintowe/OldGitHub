import { spawn } from "node:child_process";

const procs = [];
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

function start(name, cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit", shell: isWin });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] exited code=${code} signal=${signal}`);
    procs.forEach((p) => {
      if (p !== child && !p.killed) p.kill();
    });
    process.exit(code ?? 1);
  });
  procs.push(child);
}

start("vite", npmCmd, ["run", "dev:build"]);
start("reload", npmCmd, ["run", "dev:reload"]);

const shutdown = () => {
  for (const p of procs) {
    if (!p.killed) p.kill();
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
