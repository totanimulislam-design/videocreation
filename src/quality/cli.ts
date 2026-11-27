#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DesignDocument } from "../core/design-document/types.ts";
import { createAssetRegistry, createFontRegistry } from "./registries.ts";
import { evaluateDesign } from "./pipeline.ts";
import { renderMarkdownReport } from "./reports/report-generator.ts";
import type {
  AssetInfo,
  DesignBriefContext,
  ExportSpec,
  FontFaceInfo,
} from "./types.ts";
import type { VisualCritique } from "./visual/critique-schema.ts";

/**
 * Command-line quality runner.
 *
 *   npm run quality -- design.json --preview out.svg --report out.json --markdown out.md
 *
 * Exit codes: 0 approved, 1 revision required, 2 rejected, 3 usage/IO error.
 * The CLI is intentionally thin: the pipeline in `pipeline.ts` is the product.
 */

interface CliArguments {
  document?: string;
  preview?: string;
  report?: string;
  markdown?: string;
  assets?: string;
  fonts?: string;
  brief?: string;
  exports?: string;
  critique?: string;
  help: boolean;
}

function parseArguments(argv: string[]): CliArguments {
  const result: CliArguments = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      if (!result.document) result.document = argument;
      continue;
    }
    const key = argument.slice(2) as keyof CliArguments;
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      (result as unknown as Record<string, string>)[key] = value;
      index += 1;
    }
  }
  return result;
}

function usage(): string {
  return [
    "Quality Engine — evaluate a structured design document",
    "",
    "Usage:",
    "  node src/quality/cli.ts <design.json> [options]",
    "",
    "Options:",
    "  --preview <file.svg>    Write the rendered SVG preview",
    "  --report <file.json>    Write the machine-readable quality report",
    "  --markdown <file.md>    Write the human-readable quality report",
    "  --assets <file.json>    Asset registry: [{ id, available, width, height, mimeType }]",
    "  --fonts <file.json>     Font registry: [{ family, scripts, weights, available }]",
    "  --brief <file.json>     Design brief context (content requirements, category, ...)",
    "  --exports <file.json>   Export specifications to validate",
    "  --critique <file.json>  Visual critique to merge (must satisfy the critic schema)",
    "  --help                  Show this help",
    "",
    "Exit codes: 0 approved · 1 revision required · 2 rejected · 3 usage error",
  ].join("\n");
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

async function writeOutput(path: string, content: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), content, "utf8");
}

async function main(): Promise<number> {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.document) {
    console.error(usage());
    return 3;
  }

  const document = await readJson<DesignDocument>(args.document);
  const fonts = args.fonts
    ? createFontRegistry(await readJson<FontFaceInfo[]>(args.fonts))
    : createFontRegistry();
  const assets = args.assets
    ? createAssetRegistry(await readJson<AssetInfo[]>(args.assets))
    : createAssetRegistry();
  const brief = args.brief ? await readJson<DesignBriefContext>(args.brief) : {};
  const exportSpecs = args.exports ? await readJson<ExportSpec[]>(args.exports) : undefined;
  const critique = args.critique ? await readJson<VisualCritique>(args.critique) : undefined;

  const evaluation = await evaluateDesign({
    document,
    fonts,
    assets,
    brief: { ...brief, ...(document.category && !brief.category ? { category: document.category } : {}) },
    ...(exportSpecs ? { exportSpecs } : {}),
    ...(critique ? { critique } : {}),
  });

  const report = evaluation.report;
  if (args.preview && evaluation.preview) {
    await writeOutput(args.preview, evaluation.preview.preview);
  }
  if (args.report) {
    await writeOutput(args.report, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.markdown) {
    await writeOutput(args.markdown, `${renderMarkdownReport(report)}\n`);
  }

  console.log(`Design:   ${document.name ?? document.id}`);
  console.log(`Score:    ${report.totalScore}/100 (${report.qualityLevel})`);
  console.log(`Status:   ${report.deliveryStatus}`);
  console.log(`Coverage: ${report.coverage.pointsAssessed}/${report.coverage.pointsTotal} points assessed`);
  console.log(`Issues:   ${report.issues.length} (${report.criticalFailures.length} critical)`);
  if (report.coverage.missingCriteria.length > 0) {
    console.log(`Awaiting: ${report.coverage.missingCriteria.slice(0, 6).join(", ")}${report.coverage.missingCriteria.length > 6 ? ", …" : ""}`);
  }
  for (const reason of report.decision.reasons) console.log(`Reason:   ${reason}`);
  if (evaluation.critiqueErrors.length > 0) {
    console.log(`Critique: rejected (${evaluation.critiqueErrors[0]})`);
  }

  return report.deliveryStatus === "approved" ? 0 : report.deliveryStatus === "rejected" ? 2 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 3;
  });
