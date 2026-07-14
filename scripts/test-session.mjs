import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/auth/session.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const session = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);

function setDocument(cookie, login) {
  globalThis.document = {
    cookie,
    querySelector: () => login === null ? null : { content: login },
  };
}

test("does not treat GitHub's empty user-login meta as a session", () => {
  setDocument("_octo=visitor", "");
  assert.equal(session.isLoggedIn(), false);
  assert.equal(session.currentUserLogin(), null);
});

test("recognizes signed-in cookies and non-empty login metadata", () => {
  setDocument("logged_in=yes", "");
  assert.equal(session.isLoggedIn(), true);

  setDocument("dotcom_user=octocat", "");
  assert.equal(session.isLoggedIn(), true);
  assert.equal(session.currentUserLogin(), "octocat");

  setDocument("", " hubot ");
  assert.equal(session.isLoggedIn(), true);
  assert.equal(session.currentUserLogin(), "hubot");
});
