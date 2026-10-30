import { build } from "esbuild";
import { compile as compileMarkdown } from "mdsvex";
import { compile as compileSvelte } from "svelte/compiler";
import { format } from "prettier";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "src");
const pages = [
  "incidents/4471-review",
  "decisions/0002-dedupe-by-cause",
  "decisions/0003-cause-triage-provenance",
];

for (const page of pages) {
  const styles = new Map();
  const entry = join(source, "routes", "kb", page, "+page.svx");
  const result = await build({
    absWorkingDir: root,
    stdin: {
      contents: `import Page from ${JSON.stringify(entry)};
        import { render } from "svelte/server";
        export default () => render(Page);`,
      resolveDir: root,
      sourcefile: "kb-render-entry.mjs",
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    plugins: [
      {
        name: "kb-export",
        setup(bundler) {
          bundler.onResolve({ filter: /^#lib\// }, (args) => ({
            path: resolve(
              source,
              "lib",
              args.path.slice("#lib/".length) +
                (extname(args.path) ? "" : ".ts"),
            ),
          }));

          bundler.onLoad(
            { filter: /[\\/]kb[\\/]locales\.ts$/ },
            async (args) => {
              const directory = join(source, "lib", "data", "tenants");
              const entries = await Promise.all(
                (await readdir(directory))
                  .filter((name) => name.endsWith(".json"))
                  .sort()
                  .map(async (name) => [
                    `/src/lib/data/tenants/${name}`,
                    JSON.parse(await readFile(join(directory, name), "utf8")),
                  ]),
              );
              const contents = await readFile(args.path, "utf8");
              // Expand Vite's tenant glob from the same files for this static render.
              const glob =
                /import\.meta\.glob<Tenant>\(\s*['"]\/src\/lib\/data\/tenants\/\*\.json['"]\s*,\s*\{\s*eager:\s*true,\s*import:\s*['"]default['"],?\s*\},?\s*\)/;
              if (!glob.test(contents)) {
                throw new Error(
                  "Tenant glob changed; update the static renderer.",
                );
              }
              return {
                contents: contents.replace(glob, () =>
                  JSON.stringify(Object.fromEntries(entries)),
                ),
                loader: "ts",
                resolveDir: dirname(args.path),
              };
            },
          );

          bundler.onLoad({ filter: /\.(svx|svelte)$/ }, async (args) => {
            let contents = await readFile(args.path, "utf8");
            if (args.path.endsWith(".svx")) {
              const markdown = await compileMarkdown(contents, {
                filename: args.path,
                layout: {
                  runbook: join(source, "lib", "layouts", "runbook.svelte"),
                },
              });
              if (!markdown) {
                throw new Error(`Markdown compilation failed: ${args.path}`);
              }
              contents = markdown.code;
            }
            const compiled = compileSvelte(contents, {
              filename: args.path,
              generate: "server",
              css: "external",
            });
            for (const warning of compiled.warnings) {
              if (warning.code !== "css_unused_selector") {
                throw new Error(
                  `${args.path}: ${warning.code}: ${warning.message}`,
                );
              }
            }
            if (compiled.css) styles.set(args.path, compiled.css.code);
            return {
              contents: compiled.js.code,
              loader: "js",
              resolveDir: dirname(args.path),
            };
          });
        },
      },
    ],
  });
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
  const rendered = module.default();
  const destination = join(root, "rendered", "kb", page, "index.html");
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${rendered.head}
<style>${[...styles.keys()]
    .sort()
    .map((path) => styles.get(path))
    .join("\n")}</style></head>
<body>${rendered.body}</body>
</html>
`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, await format(html, { parser: "html" }));
  console.log(`Rendered ${relative(root, destination)}`);
}
