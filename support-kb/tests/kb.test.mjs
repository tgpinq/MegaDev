import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  causeOf,
  groupByCause,
  readAs,
  sameCause,
  ticketCause,
  uniqueById,
} from "../src/lib/kb/causes.ts";
import { DEDUPE_CASES } from "../src/lib/kb/dedupe-cases.ts";
import { deskRef } from "../src/lib/kb/desk-ref.ts";

const source = new URL("../src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, source), "utf8");
const rows = JSON.parse(read("lib/data/reports-4471.json"));
const notes = JSON.parse(read("lib/data/desk-notes.json"));
const tenants = new Map(
  readdirSync(new URL("lib/data/tenants/", source)).map((file) => {
    const tenant = JSON.parse(read(`lib/data/tenants/${file}`));
    return [tenant.handle, tenant];
  }),
);
const tenantOf = (report) => tenants.get(report.tenant);
const merged = uniqueById(rows).filter((report) => report.mergedInto === 4471);
const groups = groupByCause(merged, tenantOf);

test("overlapping export rows represent 412 reports without conflicting copies", () => {
  assert.equal(rows.length, 427);
  assert.equal(merged.length, 412);
  const first = new Map();
  for (const row of rows) {
    if (first.has(row.id)) assert.deepEqual(row, first.get(row.id));
    else first.set(row.id, row);
  }
});

test("tenant rules partition all reports into the exact two issue counts", () => {
  assert.deepEqual(
    groups.map((group) => [group.cause, group.reports.length]),
    [
      ["parser", 379],
      ["hint", 33],
    ],
  );
  assert.equal(groups.flatMap((group) => group.reports).length, merged.length);
  assert.equal(ticketCause(groups, 4471), "parser");
  assert.equal(
    groups.reduce(
      (count, group) =>
        count +
        group.reports.filter((report) => report.meta.intakeTag !== group.cause)
          .length,
      0,
    ),
    38,
  );
});

test("browser guesses and identical subjects do not determine the cause", () => {
  assert.deepEqual(
    DEDUPE_CASES.map((pair) =>
      sameCause(pair.a, tenantOf(pair.a), pair.b, tenantOf(pair.b)),
    ),
    [true, false, false, true, false],
  );
  for (const id of ["R-41230", "R-41241"]) {
    const report = merged.find((row) => row.id === id);
    assert.ok(report);
    assert.equal(causeOf(report, tenantOf(report)), "hint");
  }
  assert.equal(causeOf({ channel: "email" }, undefined), null);
});

test("timing anomalies remain counted, without becoming an invented third cause", () => {
  const parser = groups.find((group) => group.cause === "parser");
  const hint = groups.find((group) => group.cause === "hint");
  assert.equal(notes.oneDayMove.length, 5);
  assert.equal(readAs(parser, notes.oneDayMove), 5);
  assert.equal(readAs(hint, notes.oneDayMove), 0);
  assert.ok(
    notes.oneDayMove.every((id) => merged.some((row) => row.id === id)),
  );
});

test("receipt chronology is not the bulk merge chronology", () => {
  assert.equal(groups[0].firstSeen, "2026-04-01");
  assert.equal(groups[0].lastSeen, "2026-10-04");
  const bulk = merged.filter((row) => row.mergedAt.startsWith("2026-07-02"));
  assert.equal(bulk.length, 184);
  assert.ok(
    bulk.some((row) => row.receivedAt.slice(0, 10) < row.mergedAt.slice(0, 10)),
  );
  assert.ok(merged.some((row) => row.receivedAt.slice(0, 10) > "2026-09-30"));
});

test("new pages are signed, stamped, discoverable, and resolve their imports", () => {
  for (const path of [
    "routes/kb/incidents/4471-review/+page.svx",
    "routes/kb/decisions/0002-dedupe-by-cause/+page.svx",
  ]) {
    const page = read(path);
    const frontmatter = page.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatter);
    for (const key of ["layout", "title", "owner", "status", "reviewed"]) {
      assert.match(frontmatter[1], new RegExp(`^${key}: .+`, "m"));
    }
    assert.match(frontmatter[1], /^signature: tgpinq$/m);
    assert.ok(page.trimEnd().endsWith("<RenderStamp {signature} />"));
    assert.match(
      path,
      /^routes\/kb\/[^/]+\/.+\/\+page\.svx$/,
      "the existing KB index discovers this nested page",
    );
    for (const match of page.matchAll(/from ['"]#lib\/([^'"]+)['"]/g)) {
      assert.ok(read(`lib/${match[1]}`).length);
    }
  }
  assert.match(
    deskRef("tgpinq"),
    /^DR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
  );
  assert.equal(deskRef(" tgpinq "), deskRef("tgpinq"));
});

test("the review uses live components and links both issues and new guidance", () => {
  const review = read("routes/kb/incidents/4471-review/+page.svx");
  assert.match(review, /<CauseTable ticket=\{4471\} \/>/);
  assert.match(review, /<QueueTimeline ticket=\{4471\} \/>/);
  for (const issue of [1, 2]) {
    assert.ok(
      review.includes(`https://github.com/tgpinq/MegaDev/issues/${issue}`),
    );
  }
  for (const id of notes.oneDayMove) assert.ok(review.includes(id));
  const triage = read("routes/kb/triage/dedupe/+page.svx");
  assert.ok(triage.includes("/kb/decisions/0002-dedupe-by-cause"));
  assert.ok(!triage.includes("Merge. Splitting a ticket later is cheaper"));
  const original = read("routes/kb/incidents/4471/+page.svx");
  assert.match(original, /^status: split$/m);
  assert.ok(original.includes("/kb/incidents/4471-review"));
});

test("rendered pages include real component output and the derived desk stamp", () => {
  for (const page of [
    "incidents/4471-review",
    "decisions/0002-dedupe-by-cause",
  ]) {
    const html = readFileSync(
      new URL(`../rendered/kb/${page}/index.html`, import.meta.url),
      "utf8",
    );
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("<style>"));
    assert.ok(html.includes(deskRef("tgpinq")));
    assert.ok(!html.includes("this page isn't signed"));
    assert.ok(!html.includes("<RenderStamp"));
    if (page === "incidents/4471-review") {
      const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      assert.match(text, /412 reports merged into #4471/);
      assert.match(text, /parser 379/);
      assert.match(text, /hint 33/);
      assert.match(text, /5 reports read as a one-day move/);
      assert.ok(html.includes("<svg"));
    }
  }
});
