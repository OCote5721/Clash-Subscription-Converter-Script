#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const dgram = require("node:dgram");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { parseArgs } = require("node:util");
const { randomUUID } = require("node:crypto");
const vm = require("node:vm");

const usage = `用法：node test-routes.js <测试清单.yaml> [结果.json] [--config=<待测配置.yaml>]
      [--home=<核心工作目录>] [--secret=密钥] [--controller=http://127.0.0.1:9090]
默认用内置的六个 reject 节点执行同目录 clash-script.js，无需准备配置文件。
--config 改为检查指定 YAML，不执行 clash-script.js。
远程 rule-providers 每次下载到本次临时目录；本地规则从 --home 或配置目录读取。
test.yaml、mihomo.yaml 和规则文件保留在当前目录 ./temp/test-routes-*/ 下，供检查和复用。
清单为数组，每项包含 url、group，可选 name、ruleSet 或 rule、rulePayload。
启动临时 Mihomo，用虚假连接匹配规则，不连接目标网站或真实节点。
域名规则本身不触发 DNS；IP 规则按需通过控制接口 /dns/query 解析真实 IP。
默认结果为清单同目录的 <清单名>.results.json。
需要 Node.js 22+、npm install 和本机 Mihomo，可用 MIHOMO_BIN 指定内核。`;

async function startDNS(controller, secret) {
  const socket = dgram.createSocket("udp4");
  const abort = new AbortController();
  const queries = [];
  let closed = false;
  socket.on("message", async (message, remote) => {
    let offset = 12;
    const labels = [];
    while (message[offset]) {
      const size = message[offset++];
      labels.push(message.subarray(offset, offset + size).toString());
      offset += size;
    }
    const type = message.readUInt16BE(++offset);
    const question = message.subarray(12, offset + 4);
    const query = { name: labels.join("."), type: type === 1 ? "A" : "AAAA" };
    const answers = [];
    let status = 0;
    if ([1, 28].includes(type)) {
      queries.push(query);
      try {
        const url = new URL("/dns/query", controller);
        url.search = new URLSearchParams({ name: query.name, type: query.type });
        const response = await fetch(url, { headers: secret ? { Authorization: `Bearer ${secret}` } : {},
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]) });
        if (!response.ok) throw new Error(`DNS 控制接口返回 HTTP ${response.status}`);
        const result = await response.json();
        status = result.Status || 0;
        query.addresses = [];
        for (const record of result.Answer || []) {
          const ip = record.data.trim();
          if (record.type !== type || net.isIP(ip) !== (type === 1 ? 4 : 6)) continue;
          let bytes;
          if (type === 1) bytes = Buffer.from(ip.split(".").map(Number));
          else {
            const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
            const halves = canonical.split("::").map(half => half ? half.split(":") : []);
            const parts = halves.length === 1 ? halves[0] : [...halves[0], ...Array(8 - halves[0].length - halves[1].length).fill("0"), ...halves[1]];
            bytes = Buffer.alloc(16);
            parts.forEach((part, index) => bytes.writeUInt16BE(parseInt(part, 16), index * 2));
          }
          const header = Buffer.alloc(12);
          header.writeUInt16BE(0xc00c); header.writeUInt16BE(type, 2); header.writeUInt16BE(1, 4);
          header.writeUInt32BE(record.TTL || 0, 6); header.writeUInt16BE(bytes.length, 10);
          answers.push(header, bytes);
          query.addresses.push(ip);
        }
        query.status = status;
      } catch (error) { status = 2; query.error = error.message; }
    }
    if (closed) return;
    const header = Buffer.alloc(12);
    message.copy(header, 0, 0, 2);
    header.writeUInt16BE(0x8180 | status, 2); header.writeUInt16BE(1, 4); header.writeUInt16BE(answers.length / 2, 6);
    socket.send(Buffer.concat([header, question, ...answers]), remote.port, remote.address, () => {});
  });
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.bind(0, "127.0.0.1", resolve); });
  return { address: `udp://127.0.0.1:${socket.address().port}`, queries, close: async () => {
    closed = true; abort.abort(); await new Promise(resolve => socket.close(resolve));
  } };
}

async function generateTestConfig(sourceFile, fromYaml, dir, YAML) {
  const text = fs.readFileSync(sourceFile, "utf8");
  const source = fromYaml ? YAML.parse(text, { merge: true }) : await vm.runInNewContext(
    text + "\nmain(__inputConfig, __profileName)",
    { __inputConfig: { proxies: ["HK01", "JP01", "KR01", "SG01", "TW01", "US01"].map(name => ({ name, type: "reject" })) },
      __profileName: "test-routes", console },
    { filename: sourceFile, timeout: 10000 }
  );
  if (!Array.isArray(source?.rules) || !source.rules.length) throw new Error("待测配置需要非空 rules 数组。");
  const file = path.join(dir, "test.yaml");
  fs.writeFileSync(file, YAML.stringify(source, { lineWidth: 0 }));
  console.log(`生成配置：${file}`);
  return source;
}

async function prepareRuleProviders(source, roots, dir, YAML) {
  const providers = {};
  fs.mkdirSync(path.join(dir, "ruleset"));
  for (const [name, provider] of Object.entries(source["rule-providers"] || {})) {
    if (provider.type === "inline") {
      providers[name] = { type: "inline", behavior: provider.behavior, payload: provider.payload };
      continue;
    }
    const format = provider.format || "yaml";
    if (!["yaml", "text", "mrs"].includes(format)) throw new Error(`规则集 ${name} 的格式不支持：${format}`);
    const relative = `./ruleset/${Object.keys(providers).length}.${format}`;
    const destination = path.join(dir, relative);
    if (provider.type === "http") {
      console.log(`下载规则集：${name}`);
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(provider.header || {})) {
          for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
        }
        const response = await fetch(provider.url, { headers, signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
      } catch (error) { throw new Error(`下载规则集 ${name} 失败：${error.message}`); }
    } else if (provider.type === "file") {
      const file = provider.path && roots.map(root => path.resolve(root, provider.path)).find(file => fs.existsSync(file));
      if (!file) throw new Error(`找不到本地规则文件 ${name}，请检查 path 或用 --home 指定核心工作目录。`);
      fs.copyFileSync(file, destination);
    } else throw new Error(`规则集 ${name} 的来源类型不支持：${provider.type}`);
    providers[name] = { type: "file", behavior: provider.behavior, format, path: relative };
  }
  for (const name of ["geoip.dat", "GeoSite.dat", "country.mmdb", "geoip.metadb", "ASN.mmdb"]) {
    const file = roots.map(root => path.join(root, name)).find(file => fs.existsSync(file));
    if (file) fs.copyFileSync(file, path.join(dir, name));
  }
  const prepared = { ...source, "rule-providers": providers };
  const file = path.join(dir, "test.yaml");
  fs.writeFileSync(file, YAML.stringify(prepared, { lineWidth: 0 }));
  console.log(`规则配置：${file}`);
  return prepared;
}

function createRuntimeConfig(source, dns) {
  const aliases = new Map();
  const known = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "PASS-RULE", "COMPATIBLE", "GLOBAL", "DNS",
    ...(source.proxies || []).map(p => p.name), ...(source["proxy-groups"] || []).map(p => p.name)]);
  const rewrite = rules => (rules || []).map(rule => {
    const parts = rule.split(",");
    if (parts[0].trim().toUpperCase() === "SUB-RULE") return rule;
    const index = parts.at(-1).trim() === "no-resolve" ? parts.length - 2 : parts.length - 1;
    const target = parts[index].trim();
    if (["PASS", "PASS-RULE"].includes(target)) return rule;
    if (!known.has(target)) throw new Error(`规则引用了不存在的策略：${target}`);
    if (!aliases.has(target)) aliases.set(target, `__route_test_policy_${aliases.size}`);
    parts[index] = aliases.get(target);
    return parts.join(",");
  });
  const rules = rewrite(source.rules);
  const subRules = Object.fromEntries(Object.entries(source["sub-rules"] || {}).map(([name, rules]) => [name, rewrite(rules)]));
  const labels = new Map([...aliases].map(([label, alias]) => [alias, { group: label }]));
  const fallback = `__route_test_policy_${aliases.size}`;
  labels.set(fallback, { group: "DIRECT", defaultRule: true });
  // 原配置没有 MATCH 时，核心默认 DIRECT；用内部空出站模拟，防止意外拨号。
  rules.push(`MATCH,${fallback}`);
  // 不启动原配置的订阅、节点、嗅探、TUN、脚本钩子或健康检查。
  const config = { mode: "rule", "log-level": "debug", "allow-lan": false, "bind-address": "127.0.0.1",
    ipv6: source.ipv6 || false, "find-process-mode": "off", hosts: source.hosts,
    dns: { enable: true, ipv6: source.ipv6 || false, "use-hosts": false, "use-system-hosts": false, nameserver: [dns] },
    proxies: [...labels.keys()].map(name => ({ name, type: "reject" })),
    rules, "sub-rules": subRules, "rule-providers": source["rule-providers"],
    "geodata-mode": source["geodata-mode"] || false,
    // 缺失地理数据时仅在本机失败，避免核心自动访问下载站点。
    "geox-url": Object.fromEntries(["geoip", "geosite", "mmdb", "asn"].map(name => [name, `http://127.0.0.1:1/${name}`])) };
  return { config, labels };
}

async function startCore(config, labels, dir, YAML) {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const file = path.join(dir, "mihomo.yaml");
  const readyHost = `ready-${randomUUID()}.invalid`;
  fs.writeFileSync(file, YAML.stringify({ ...config, "mixed-port": port,
    rules: [`DOMAIN,${readyHost},REJECT`, ...config.rules] }, { lineWidth: 0 }));
  console.log(`核心配置：${file}`);
  let child = spawn(process.env.MIHOMO_BIN || "mihomo", ["-d", dir, "-f", file]);
  try { await once(child, "spawn"); }
  catch (error) {
    if (error.code !== "ENOENT" || process.env.MIHOMO_BIN || process.platform !== "darwin") throw error;
    child = spawn("/Applications/Clash Verge.app/Contents/MacOS/verge-mihomo", ["-d", dir, "-f", file]);
    await once(child, "spawn");
  }
  const hits = new Map(), waiters = new Map();
  let tail = "", failure, dnsError;
  const ready = Promise.withResolvers();
  const timer = setTimeout(() => ready.reject(new Error("临时核心启动超过 10 秒")), 10000);
  // 端口开始监听时规则集可能尚未加载；实际命中内部规则后才开始正式测试。
  const startup = setInterval(() => {
    const request = http.request({ hostname: "127.0.0.1", port, method: "CONNECT", path: `${readyHost}:443`, agent: false });
    request.on("error", () => {});
    request.on("connect", (response, socket) => {
      socket.on("error", () => {});
      socket.setTimeout(1000, () => socket.destroy());
      socket.resume(); socket.write(Buffer.from([0]));
    });
    request.setTimeout(1000, () => request.destroy());
    request.end();
  }, 25);
  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", line => {
    tail = (tail + line + "\n").slice(-4000);
    let message = line;
    const quoted = line.match(/\bmsg=("(?:\\.|[^"\\])*")/);
    if (quoted) { try { message = JSON.parse(quoted[1]); } catch {} }
    if (/\blevel=(?:error|fatal)\b/.test(line)) {
      ready.reject(new Error(`临时核心加载失败：${message}`));
      return;
    }
    if (message.includes(`match Domain(${readyHost}) using REJECT`)) ready.resolve();
    if (message.includes("[DNS] resolve ") && message.includes(" error:")) dnsError = message;
    const source = message.match(/\[TCP\]\s+\S+:(\d+)\s+-->/);
    const match = message.match(/ match ([\w-]+)(?:\((.*)\))? using (__route_test_policy_\d+)/);
    if (!source || !match || !labels.has(match[3])) return;
    const sourcePort = Number(source[1]);
    const label = labels.get(match[3]);
    const actual = { sourcePort, rule: label.defaultRule ? "Default" : match[1], rulePayload: match[2] || "", group: label.group,
      ...(dnsError ? { dnsError } : {}) };
    hits.set(sourcePort, actual);
    waiters.get(sourcePort)?.resolve(actual);
  });
  child.stderr.on("data", chunk => { tail = (tail + chunk).slice(-4000); });
  child.once("close", () => {
    failure = new Error(`临时核心已退出：${tail.trim()}`);
    ready.reject(failure);
    for (const waiter of waiters.values()) waiter.reject(failure);
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      stop();
      await closed;
    }
    lines.close();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  };
  try { await ready.promise; }
  catch (error) { await close(); throw error; }
  finally { clearTimeout(timer); clearInterval(startup); }
  return { port, close, begin: () => { dnsError = undefined; }, capture: async (sourcePort, signal) => {
    if (failure) throw failure;
    const waiter = Promise.withResolvers();
    const onAbort = () => waiter.reject(signal.reason);
    waiters.set(sourcePort, waiter);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    else if (hits.has(sourcePort)) waiter.resolve(hits.get(sourcePort));
    try { return await waiter.promise; }
    finally { waiters.delete(sourcePort); hits.delete(sourcePort); signal.removeEventListener("abort", onAbort); }
  } };
}

async function probe(test, core) {
  const expectedRule = test.rule ?? (test.ruleSet ? "RuleSet" : undefined);
  const expectedPayload = test.rulePayload ?? test.ruleSet;
  const result = { name: test.name || test.url, url: test.url,
    expected: { group: test.group, ...(expectedRule !== undefined ? { rule: expectedRule } : {}),
      ...(expectedPayload !== undefined ? { rulePayload: expectedPayload } : {}) },
    actual: null, routeStatus: "unconfirmed" };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error("规则匹配超过 15 秒（可能正在等待 DNS）")), 15000);
  let socket, request, sourcePort;
  core.begin();
  try {
    const target = new URL(test.url);
    await new Promise((resolve, reject) => {
      request = http.request({ hostname: "127.0.0.1", port: core.port, method: "CONNECT", agent: false,
        path: `${target.hostname}:${target.port || (target.protocol === "https:" ? 443 : 80)}`, signal: abort.signal });
      request.on("socket", connection => {
        connection.once("connect", () => { sourcePort = connection.localPort; });
      });
      request.once("error", reject);
      request.once("connect", (response, connection) => {
        socket = connection;
        sourcePort ||= socket.localPort;
        socket.on("error", () => {});
        if (response.statusCode !== 200) return reject(new Error(`虚拟入站返回 ${response.statusCode}`));
        resolve();
      });
      request.end();
    });
    const captured = core.capture(sourcePort, abort.signal);
    // 触发核心读取入站数据；所有出站是内部空连接，这个字节不会发往目标地址。
    socket.write(Buffer.from([0]));
    result.actual = await captured;
    if (result.actual.dnsError) throw new Error("DNS 解析失败，无法完整验证后续 IP 规则。");
    result.routeStatus = result.actual.group === test.group &&
      (expectedRule === undefined || result.actual.rule.toLowerCase() === expectedRule.toLowerCase()) &&
      (expectedPayload === undefined || result.actual.rulePayload === expectedPayload) ? "pass" : "fail";
  } catch (error) { result.error = error.message; }
  finally { clearTimeout(timer); abort.abort(); socket?.destroy(); request?.destroy(); }
  return result;
}

async function runRuleTests(source, tests, dir, controller, secret, YAML) {
  let core, dns;
  const results = [];
  try {
    dns = await startDNS(controller, secret);
    const runtime = createRuntimeConfig(source, dns.address);
    core = await startCore(runtime.config, runtime.labels, dir, YAML);
    for (const test of tests) {
      const before = dns.queries.length;
      const result = await probe(test, core);
      result.dnsQueries = dns.queries.slice(before);
      results.push(result);
    }
    return results;
  } finally { await core?.close(); await dns?.close(); }
}

async function main(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true,
    options: { config: { type: "string" }, home: { type: "string" }, secret: { type: "string" }, controller: { type: "string" },
      help: { type: "boolean", short: "h" } } });
  if (values.help) return console.log(usage);
  if (positionals.length < 1 || positionals.length > 2) throw Object.assign(new Error(usage), { exitCode: 2 });
  let YAML;
  try { YAML = require("yaml"); }
  catch { throw new Error("缺少 yaml 依赖，请先在工具目录运行 npm install。"); }
  const input = fs.realpathSync(positionals[0]);
  const sourceFile = fs.realpathSync(values.config || path.join(__dirname, "clash-script.js"));
  let output = path.resolve(positionals[1] || path.join(path.dirname(input), `${path.parse(input).name}.results.json`));
  output = fs.existsSync(output) ? fs.realpathSync(output)
    : path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
  if ([input, sourceFile, fs.realpathSync(__filename)].includes(output)) throw new Error("结果不能覆盖测试清单、待测配置或脚本。");
  const tests = YAML.parse(fs.readFileSync(input, "utf8"));
  if (!Array.isArray(tests) || !tests.length) throw new Error("测试清单必须是非空数组。");
  for (const [index, test] of tests.entries()) {
    if (!test || typeof test.url !== "string" || typeof test.group !== "string" || !test.group.trim() ||
        ["ruleSet", "rule"].some(key => test[key] !== undefined && (typeof test[key] !== "string" || !test[key].trim())) ||
        (test.rulePayload !== undefined && typeof test.rulePayload !== "string")) throw new Error(`第 ${index + 1} 项的 url、group 或规则断言格式不正确。`);
    if (test.ruleSet !== undefined && (test.rule !== undefined || test.rulePayload !== undefined)) throw new Error(`第 ${index + 1} 项的 ruleSet 不能与 rule、rulePayload 同时填写。`);
    const url = new URL(test.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(`第 ${index + 1} 项需要无账号密码的 HTTP(S) URL。`);
  }
  const controller = new URL(values.controller ?? (process.env.MIHOMO_CONTROLLER || "http://127.0.0.1:9090"));
  if (!["http:", "https:"].includes(controller.protocol) || controller.username || controller.password) throw new Error("控制接口需要无内嵌账号密码的 HTTP(S) 地址。");
  const secret = values.secret ?? process.env.MIHOMO_SECRET ?? "";
  const roots = values.home ? [fs.realpathSync(values.home)] : [path.dirname(sourceFile), path.dirname(path.dirname(sourceFile))];
  const tempRoot = path.resolve("temp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempRoot, "test-routes-"));
  console.log(`运行目录（保留）：${dir}`);
  const report = { virtual: true, ...(values.config ? { config: sourceFile } : { script: sourceFile }),
    controller: controller.origin, workDir: dir, startedAt: new Date().toISOString(), results: [] };
  const generated = await generateTestConfig(sourceFile, Boolean(values.config), dir, YAML);
  const prepared = await prepareRuleProviders(generated, roots, dir, YAML);
  report.results = await runRuleTests(prepared, tests, dir, controller, secret, YAML);
  report.finishedAt = new Date().toISOString();
  report.summary = { pass: 0, fail: 0, unconfirmed: 0 };
  for (const result of report.results) report.summary[result.routeStatus]++;
  const tempDir = fs.mkdtempSync(path.join(path.dirname(output), ".test-routes-"));
  try {
    const temporary = path.join(tempDir, "results.json");
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + "\n");
    fs.renameSync(temporary, output);
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  console.table(report.results.map(r => ({
    目标: r.name, 预期: r.expected.group,
    命中: r.actual ? (r.actual.rulePayload ? `${r.actual.rule}:${r.actual.rulePayload}` : r.actual.rule) : "未确认",
    策略: r.actual?.group || "未确认", DNS查询: r.dnsQueries.length,
    分流: ({ pass: "通过", fail: "不符", unconfirmed: "未确认" })[r.routeStatus],
    错误: r.error || "",
  })));
  console.log(`分流通过 ${report.summary.pass}，不符 ${report.summary.fail}，未确认 ${report.summary.unconfirmed}。`);
  console.log(`结果已保存：${output}`);
  if (report.summary.fail || report.summary.unconfirmed) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(error => {
  console.error(`测试失败：${error.message}`);
  process.exitCode = error.exitCode || 1;
});
