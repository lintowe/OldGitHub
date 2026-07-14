import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/adapters/rate-limit.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);

test("deduplicates concurrent requests and caches successful responses", async () => {
  api.clearApiCache();
  api.clearRateLimit();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ call: calls }), { headers: { "content-type": "application/json" } });
  };

  const [first, second] = await Promise.all([
    api.fetchApi("https://api.github.com/repos/octocat/Hello-World"),
    api.fetchApi("https://api.github.com/repos/octocat/Hello-World"),
  ]);
  const third = await api.fetchApi("https://api.github.com/repos/octocat/Hello-World");

  assert.equal(calls, 1);
  assert.deepEqual(await first.json(), { call: 1 });
  assert.deepEqual(await second.json(), { call: 1 });
  assert.deepEqual(await third.json(), { call: 1 });
});

test("blocks locally until GitHub's reset time", async () => {
  api.clearApiCache();
  api.clearRateLimit();
  let calls = 0;
  const reset = Math.ceil(Date.now() / 1000) + 60;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
    });
  };

  assert.equal((await api.fetchApi("https://api.github.com/rate_limit")).status, 403);
  const blocked = await api.fetchApi("https://api.github.com/users/octocat");
  assert.equal(blocked.status, 429);
  assert.equal(calls, 1);
  assert.equal(api.isApiRateLimited(), true);
});

test("serves cached data after the final allowed request", async () => {
  api.clearApiCache();
  api.clearRateLimit();
  let calls = 0;
  const reset = Math.ceil(Date.now() / 1000) + 60;
  globalThis.fetch = async () => {
    calls++;
    return new Response("cached", {
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
    });
  };

  assert.equal(await (await api.fetchApi("https://api.github.com/users/octocat")).text(), "cached");
  assert.equal(await (await api.fetchApi("https://api.github.com/users/octocat")).text(), "cached");
  assert.equal((await api.fetchApi("https://api.github.com/users/hubot")).status, 429);
  assert.equal(calls, 1);
});
