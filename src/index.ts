#!/usr/bin/env node

import { execFileSync } from "child_process";
import * as commander from "commander";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as rimraf from "rimraf";
import { promisify } from "util";
import * as webpack from "webpack";

const webpackP = promisify(webpack);

const main = async () => {
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

  const directory = fs.mkdtempSync(path.join(__dirname, "../tmp"));
  const combinedSchema = path.join(directory, "schema.tmp.graphql");

  fs.writeFileSync(combinedSchema, fs.readFileSync(schemaFile));
  fs.appendFileSync(combinedSchema, "\n");
  fs.appendFileSync(
    combinedSchema,
    fs.readFileSync(path.join(__dirname, "../files/scalars.graphql"))
  );

  const schemaTypes = path.join(directory, "types.tmp.ts");
  execFileSync(path.join(require.resolve("apollo"), "../../../.bin/apollo"), [
    "client:codegen",
    "--localSchemaFile",
    combinedSchema,
    "--target",
    "typescript",
    "--addTypename",
    "--outputFlat",
    "--passthroughCustomScalars",
    schemaTypes
  ]);

  const outputTypes = path.join(directory, "query-types.ts");
  fs.writeFileSync(outputTypes, fs.readFileSync(schemaTypes));
  fs.appendFileSync(outputTypes, "\n");
  fs.appendFileSync(
    outputTypes,
    fs.readFileSync(path.join(__dirname, "../files/scalars.ts"))
  );

  fs.unlinkSync(combinedSchema);
  fs.unlinkSync(schemaTypes);

  const gqlFiles = glob.sync(path.join(queriesFolder, "**", "*.graphql"));
  const gqlFilenames = gqlFiles
    .map(
      f =>
        `'${f
          .replace(`${queriesFolder}/`, "")
          .replace(/(^\.\/queries\/|fragments\/|\.graphql$)/g, "")}'`
    )
    .join(",");
  const typedArray = `export const manifest = [${gqlFilenames}] as [${gqlFilenames}];`;
  fs.writeFileSync(path.join(directory, "manifest.ts"), typedArray);

  fs.copyFileSync(
    path.join(__dirname, "../files/index.ts"),
    path.join(directory, "index.ts")
  );
  fs.copyFileSync(
    path.join(__dirname, "../files/types.ts"),
    path.join(directory, "types.ts")
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
        outDir: libFolder
      }
    })
  );

  execFileSync(path.join(require.resolve("typescript"), "../../../.bin/tsc"), [
    "--build",
    path.join(directory, "tsconfig.json")
  ]);

  const queryDirectory = path.join(directory, "queries");
  fs.mkdirSync(queryDirectory);
  for (const file of gqlFiles) {
    fs.copyFileSync(file, path.join(queryDirectory, path.basename(file)));
  }
  fs.copyFileSync(
    path.join(__dirname, "../files/bundler.js"),
    path.join(queryDirectory, "index.js")
  );
  fs.copyFileSync(
    path.join(libFolder, "manifest.js"),
    path.join(queryDirectory, "manifest.js")
  );

  await webpackP([
    {
      entry: path.join(queryDirectory, "index.js"),
      target: "node",
      output: {
        filename: "queries.bundle.js",
        path: libFolder,
        library: "index",
        libraryTarget: "commonjs2"
      },
      resolve: {
        extensions: [".js", ".graphql", ".gql"]
      },
      module: {
        rules: [
          {
            test: /\.(graphql|gql)$/,
            exclude: /node_modules/,
            loader: "graphql-tag/loader"
          }
        ]
      }
    }
  ]);

  rimraf.sync(directory);
};
main().catch(e => {
  console.error(e.message);
  process.exit(-1);
});
