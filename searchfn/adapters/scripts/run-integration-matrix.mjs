import { execSync } from "node:child_process";

const cwd = process.cwd();

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    cwd,
    stdio: "inherit",
    ...options,
  });
}

function hasDockerCompose() {
  try {
    execSync("docker compose version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const composeFiles = [
  "docker-compose.postgres.yml",
  "docker-compose.meili.yml",
  "docker-compose.elastic.yml",
];

let dockerReady = hasDockerCompose();
let dockerStarted = false;

try {
  if (dockerReady) {
    try {
      for (const composeFile of composeFiles) {
        run(`docker compose -f ${composeFile} up -d`);
        dockerStarted = true;
      }
    } catch {
      console.warn("Docker services could not be started; running matrix tests without managed services");
      dockerReady = false;
    }
  } else {
    console.warn("Docker Compose not available; running integration matrix without managed services");
  }

  run("npx vitest --config vitest.integration.config.ts", {
    env: {
      ...process.env,
      SEARCHFN_REQUIRE_MATRIX: dockerReady ? "1" : process.env.SEARCHFN_REQUIRE_MATRIX,
    },
  });
} finally {
  if (dockerStarted) {
    for (const composeFile of composeFiles.slice().reverse()) {
      try {
        run(`docker compose -f ${composeFile} down -v`);
      } catch {
        // Best effort cleanup.
      }
    }
  }
}
