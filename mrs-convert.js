#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const usage = `用法：node mrs-convert.js <domain|ipcidr> <输入文件> <输出文件>
支持：.mrs 与 .yaml/.yml/.txt/.list 双向转换。
示例：node mrs-convert.js domain rules.mrs rules.yaml
      node mrs-convert.js ipcidr rules.txt rules.mrs
使用 MIHOMO_BIN 指定内核；默认查找 PATH 中的 mihomo 或 macOS Clash Verge 内核。`;

function fail(message, exitCode = 1) {
  throw Object.assign(new Error(message), { exitCode });
}

function main(args) {
  if (args.length === 1 && ["-h", "--help"].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (args.length !== 3) fail(usage, 2);
  const [behavior, inputArg, outputArg] = args;
  if (!["domain", "ipcidr"].includes(behavior)) fail("规则类型只能是 domain 或 ipcidr；MRS 不支持 classical。", 2);
  const input = fs.realpathSync(inputArg);
  if (!fs.statSync(input).isFile()) fail("输入必须是文件。");
  let output = path.resolve(outputArg);
  output = fs.existsSync(output)
    ? fs.realpathSync(output)
    : path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
  if (input === output) fail("输入与输出不能是同一个文件。", 2);

  const inputExt = path.extname(input).toLowerCase();
  const outputExt = path.extname(output).toLowerCase();
  const formats = { ".mrs": "mrs", ".yaml": "yaml", ".yml": "yaml", ".txt": "text", ".list": "text" };
  if (!formats[inputExt] || !formats[outputExt]) fail("无法识别扩展名，请使用 .mrs/.yaml/.yml/.txt/.list。", 2);
  if ((inputExt === ".mrs") === (outputExt === ".mrs")) fail("输入和输出中必须有且只有一方是 .mrs。", 2);

  // 临时结果与输出在同一目录，全部转换成功后才替换已有输出。
  const tempDir = fs.mkdtempSync(path.join(path.dirname(output), ".mrs-convert-"));
  try {
    const exportYaml = inputExt === ".mrs" && formats[outputExt] === "yaml";
    const converted = path.join(tempDir, "converted");
    const coreArgs = ["convert-ruleset", behavior, formats[inputExt], input, converted];
    let child = spawnSync(process.env.MIHOMO_BIN || "mihomo", coreArgs, { stdio: "inherit" });
    if (child.error?.code === "ENOENT" && !process.env.MIHOMO_BIN && process.platform === "darwin") {
      child = spawnSync("/Applications/Clash Verge.app/Contents/MacOS/verge-mihomo", coreArgs, { stdio: "inherit" });
    }
    if (child.error) fail(`无法运行 Mihomo，请通过 MIHOMO_BIN 指定内核路径：${child.error.message}`);
    if (child.status !== 0) fail("Mihomo 转换失败。", child.status || 1);

    if (exportYaml) {
      const rules = fs.readFileSync(converted, "utf8").split(/\r?\n/).filter(Boolean);
      const yaml = "payload:\n" + rules.map(rule => `  - '${rule.replace(/'/g, "''")}'\n`).join("");
      fs.writeFileSync(converted, yaml);
    }
    fs.renameSync(converted, output);
    console.log(`已生成：${output}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode || 1;
}
