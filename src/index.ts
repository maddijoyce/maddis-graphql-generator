#!/usr/bin/env node

import { execFileSync } from "child_process";
import * as commander from "commander";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as rimraf from "rimraf";
import * as graphql from "graphql";

const directory = fs.mkdtempSync(path.join(__dirname, "../tmp"));
try {
  commander
    .version("0.0.1")
    .option("-s, --schema <file>", "Schema File")
    .option("-q, --queries <folder>", "Queries Folder")
    .parse(process.argv);

  if (!commander.schema)
    throw new Error("Schema file location must be set (-s, --schema)");
  if (!commander.queries)
    throw new Error("Queries folder location must be set (-q, --queries)");

  const schemaFile = path.join(process.cwd(), commander.schema);
  const queriesFolder = path.join(process.cwd(), commander.queries);
  const libFolder = path.join(process.cwd(), "lib");

  if (!fs.existsSync(schemaFile))
    throw new Error(`Schema file ${commander.schema} doesn't exist`);
  if (!fs.existsSync(queriesFolder))
    throw new Error(`Queries folder ${commander.queries} doesn't exist`);

  const tmpSchemaFile = path.join(directory, "schema.graphql");
  fs.copyFileSync(schemaFile, tmpSchemaFile);
  fs.appendFileSync(
    tmpSchemaFile,
    `
    directive @aws_subscribe(
      mutations: [String]
    ) on FIELD_DEFINITION
  `
  );

  const outputTypes = path.join(directory, "query-types.ts");
  execFileSync(path.join(require.resolve("apollo"), "../../../.bin/apollo"), [
    "client:codegen",
    "--localSchemaFile",
    tmpSchemaFile,
    "--target",
    "typescript",
    "--addTypename",
    "--outputFlat",
    outputTypes
  ]);

  const gqlFiles = glob.sync(path.join(queriesFolder, "**", "*.graphql"));
  const gqlFilenames = gqlFiles.map(f => {
    const variable = f
      .replace(`${queriesFolder}/`, "")
      .replace(/\.graphql$/g, "");
    const value = graphql.parse(fs.readFileSync(f).toString(), {
      noLocation: true
    });
    return `export const ${variable}: DocumentNode = ${JSON.stringify(value)}`;
  });
  gqlFilenames.unshift('import { DocumentNode } from "graphql"');

  fs.writeFileSync(
    path.join(directory, "query-documents.ts"),
    gqlFilenames.join("\n")
  );

  fs.copyFileSync(
    path.join(__dirname, "../files/index.ts"),
    path.join(directory, "index.ts")
  );

  fs.writeFileSync(
    path.join(directory, "tsconfig.json"),
    JSON.stringify({
      include: ["./*"],
      compilerOptions: {
        target: "es2017",
        module: "commonjs",
        moduleResolution: "node",
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        composite: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        noImplicitReturns: true,
        noImplicitThis: true,
        noImplicitAny: true,
        strictNullChecks: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        rootDir: ".",
        outDir: libFolder,
        types: ["node"]
      }
    })
  );

  execFileSync(path.join(require.resolve("typescript"), "../../../.bin/tsc"), [
    "--build",
    path.join(directory, "tsconfig.json")
  ]);
} catch (e) {
  console.error(e.message);
  console.error(e.stdout.toString());
  console.error(e.stderr.toString());
  process.exit(-1);
} finally {
  rimraf.sync(directory);
}
