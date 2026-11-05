#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const usage = `用法：node apply-main.js <脚本.js> <输入.yaml> <输出.yaml>
示例：node apply-main.js clash-script.js example.yaml example.test.yaml
      node apply-main.js /path/to/custom.js input.yaml output.yaml
首次使用前，在工具目录运行 npm install。`;

async function main(args) {
  if (args.length === 1 && ["-h", "--help"].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (args.length !== 3) throw Object.assign(new Error(usage), { exitCode: 2 });
  const [scriptArg, inputArg, outputArg] = args;
  const scriptFile = fs.realpathSync(scriptArg);
  const inputFile = fs.realpathSync(inputArg);
  let outputFile = path.resolve(outputArg);
  outputFile = fs.existsSync(outputFile)
    ? fs.realpathSync(outputFile)
    : path.join(fs.realpathSync(path.dirname(outputFile)), path.basename(outputFile));
  if (outputFile === inputFile || outputFile === scriptFile) {
    throw Object.assign(new Error("输出不能覆盖输入配置或 JavaScript 脚本。"), { exitCode: 2 });
  }

  let YAML;
  try {
    YAML = require("yaml");
  } catch {
    throw new Error("缺少 yaml 依赖，请先在工具目录运行 npm install。");
  }
  const config = YAML.parse(fs.readFileSync(inputFile, "utf8"), { merge: true });
  const script = fs.readFileSync(scriptFile, "utf8");
  const result = await vm.runInNewContext(
    script + "\nmain(__inputConfig, __profileName)",
    { __inputConfig: config, __profileName: path.basename(inputFile), console },
    { filename: scriptFile, timeout: 10000 }
  );
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("main 必须返回一个配置对象。");
  }
  const yaml = YAML.stringify(result, { lineWidth: 0 });
  const tempDir = fs.mkdtempSync(path.join(path.dirname(outputFile), ".apply-main-"));
  try {
    const tempOutput = path.join(tempDir, "output.yaml");
    fs.writeFileSync(tempOutput, yaml);
    fs.renameSync(tempOutput, outputFile);
    console.log(`已生成：${outputFile}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error(`转换失败：${error.message}`);
  process.exitCode = error.exitCode || 1;
});
