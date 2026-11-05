# Clash Subscription Converter Script

为 Mihomo 客户端的订阅自动生成国家分组、应用分流和 DNS 配置。支持自动识别节点地区、添加国旗、排序节点，并为不同应用选择独立出口。

## 使用要求

- 客户端使用支持 MRS 规则的 Mihomo 内核，并支持 JavaScript 覆写，例如 Clash Verge Rev。
- 订阅中包含有效的 `proxies` 节点列表；仅包含 `proxy-providers` 的订阅不能直接使用此脚本。
- 不支持 JavaScript 覆写的客户端，可使用下方的 YAML 模板。

## 安装与启用

1. 在客户端导入自己的节点订阅。
2. 下载 [clash-script.js](./clash-script.js)，将完整内容粘贴到该订阅的 JavaScript 扩展脚本中；支持远程脚本的客户端也可以使用以下链接导入。
3. 保存并应用覆写配置，切换到规则模式。
4. 打开代理组，在“主代理”中选择国家组或节点，再按需要调整各应用组。

```text
https://raw.githubusercontent.com/OCote5721/Clash-Subscription-Converter-Script/main/clash-script.js
https://cdn.jsdmirror.com/gh/OCote5721/Clash-Subscription-Converter-Script@main/clash-script.js
```

## 个性化设置

在脚本顶部修改以下变量，然后保存并重新应用覆写配置：

```javascript
const SHOW_INFO_NODES_IN_MAIN = true;
const SHOW_DIRECT_IN_MAIN = false;
const APPLY_ORIGINAL_HOSTS = true;
const COUNTRY_GROUP_TYPE = "url-test";
```

| 变量 | 默认值 | 使用说明 |
| --- | --- | --- |
| `SHOW_INFO_NODES_IN_MAIN` | `true` | 保留剩余流量、套餐到期等提示节点。设为 `false` 后，这些节点在主代理和全局模式中均不可见。 |
| `SHOW_DIRECT_IN_MAIN` | `false` | 主代理中不显示 DIRECT。设为 `true` 可加入直连选项；不影响其他应用组。 |
| `APPLY_ORIGINAL_HOSTS` | `true` | 按订阅自带的 hosts 映射改写节点连接地址，不联网查询 DNS。设为 `false` 保留节点原地址；两种设置都不会将订阅 hosts 写入输出。 |
| `COUNTRY_GROUP_TYPE` | `"url-test"` | 国家组自动选择低延迟节点。改为 `"select"` 后，可在国家组中手动选节点。 |

### 添加前置规则

在 `main` 函数外的 `prepend` 数组中填写规则，作用类似 YAML 覆写的 `rules.prepend`。例如：

```javascript
const prepend = [
  "DOMAIN-SUFFIX,example.com,DIRECT",
  "DOMAIN,example.net,主代理",
  "PROCESS-NAME,example.exe,DIRECT",
  "IP-CIDR,192.0.2.0/24,DIRECT,no-resolve"
];
```

将规则写成字符串，使用 Mihomo 的规则语法。规则按填写顺序排在所有内置规则之前，先命中先生效；留空 `[]` 则只使用内置规则。目标可以是 DIRECT、REJECT、现有策略组或输出节点的完整名称。

前置规则保持原样，引用的节点、策略组和规则集需要在输出配置中存在；关闭对应应用组后，需自行调整前置规则的目标。修改后保存并重新应用覆写配置。

### 调整国家分组

`sortOrder` 同时控制国家组的启用范围和显示顺序：

```javascript
const sortOrder = ["HK", "JP", "KR", "SG", "TW", "US"];
```

调整顺序即可改变排列；删除某个国家代码后，该地区节点仍保留在主代理中，但不再生成对应国家组。

添加新国家时，需要同时在 `countryMapping` 中添加匹配规则，并在 `sortOrder` 中加入国家代码。例如添加马来西亚：

```javascript
// 在 countryMapping 数组中添加：
{ regex: countryRegex(/🇲🇾|马来西亚|馬來西亞/, /MY|Malaysia/), flag: "🇲🇾", name: "MY" },

// 在 sortOrder 数组中加入 MY：
const sortOrder = ["HK", "JP", "KR", "SG", "TW", "US", "MY"];
```

英文匹配忽略大小写，支持 `HK01`、`VIP_HK_01` 等名称。名称中没有可识别地区的节点仍会保留。

### 启用、关闭及排序应用组

修改 `appGroupOrder` 数组：调整名称顺序可改变显示顺序，删除某项可关闭对应组。关闭应用组后，其路由和 DNS 策略回退到主代理，而不是自动改为直连。

各应用组（包括 Final）在原有选项后列出全部普通节点，可直接指定单个节点。节点按国家顺序排列，剩余流量、套餐到期等提示节点不会出现在应用组中。

只需调整当前出口时，直接在客户端选择策略即可，无需修改脚本。

## 配置覆写范围

脚本会重建策略组、规则集、分流规则及 DNS，并设置嗅探、节点选择记忆等配置。规则模式、IPv6 关闭、局域网代理访问关闭，以及控制地址 `127.0.0.1:9090` 均由脚本指定。

订阅 hosts 默认仅用于改写节点地址，并尽量保留原 TLS 名称和 WebSocket Host。不要依赖它继续为普通网站提供 hosts 映射。

DNS 由脚本统一生成，不继承订阅的 DNS 设置。节点域名使用 AliDNS、DNSPod 和 OneDNS 的直连 DoH 解析，网站域名按脚本中的应用 DNS 策略处理；DNS 监听地址固定为 `0.0.0.0:1053`。需要自定义时，修改脚本内对应配置后重新应用。

节点名称会自动去重，链式代理的节点引用会随重命名更新。订阅中有重复原始名称、引用失效、循环依赖，或仅有提示节点而没有普通节点时，脚本会报错，需要先修正订阅或相关设置。


## 规则来源

大部分远程规则来自 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)，每 24 小时刷新，下载使用 jsDelivr，缓存位于 `./ruleset/`。CDN 内容更新可能有延迟。

SteamDownload 使用 [ackness 的 Steam 下载规则](https://raw.githubusercontent.com/ackness/rules/main/clash/steam-download.yaml)，默认 DIRECT，优先于 Steam 商店和社区规则。规则每 24 小时拉取一次，缓存位于 `./ruleset/`；内容更新取决于上游维护。可在客户端单独选择其出口。

## 不支持脚本的客户端

使用独立的 [proxy-providers.yaml](./proxy-providers.yaml) 模板，其策略组、规则及设置以模板自身内容为准。

1. 下载模板，将 `proxy-providers` 中的 `url` 填为自己的订阅链接，并为 `path` 设置文件名。
2. 保存后作为配置文件导入客户端，更新节点订阅并选择主代理。
3. 需要调整国家分组时，编辑模板中的节点名称替换规则和国家策略组；YAML 模板不会根据节点地区自动增删分组。

```yaml
proxy-providers:
  provider-1:
    type: http
    url: "填写你的订阅链接"
    path: ./proxies/provider-1.yaml
    interval: 86400
```

下载地址：

```text
https://raw.githubusercontent.com/OCote5721/Clash-Subscription-Converter-Script/main/proxy-providers.yaml
https://cdn.jsdmirror.com/gh/OCote5721/Clash-Subscription-Converter-Script@main/proxy-providers.yaml
```

保留自己的配置副本；重新下载模板覆盖本地文件会丢失已填写的订阅链接和自定义设置。[example.yaml](./example.yaml) 可用于查看配置结构，实际生成结果由订阅与脚本设置决定。

## 终端工具

以下工具使用 Node.js 运行，支持 macOS、Linux 和 Windows；MRS 转换需要对应平台的 Mihomo 内核。在项目目录执行以下命令，输入文件和当前客户端配置不会被改写。

### MRS 与 YAML/TXT 转换

`mrs-convert.js` 调用本机 Mihomo，支持 `domain` 或 `ipcidr` 类型的 MRS 与 YAML/TXT 双向转换：

```sh
# 域名 MRS 导出为 YAML 或 TXT
node mrs-convert.js domain input.mrs output.yaml
node mrs-convert.js domain input.mrs output.txt

# YAML 或 TXT 转为 MRS
node mrs-convert.js domain input.yaml output.mrs
node mrs-convert.js ipcidr input.txt output.mrs
```

工具根据扩展名识别格式，支持 `.mrs`、`.yaml`、`.yml`、`.txt`、`.list`。YAML 规则需要 `payload` 列表；域名项使用 `+.example.com` 等域名格式，IP 项使用 CIDR 格式。`classical` 不能直接转成 MRS。导出的规则会规范化，不保留原注释与排列。

默认查找 PATH 中的 `mihomo`，或 macOS Clash Verge 自带内核。也可指定内核路径：

```sh
MIHOMO_BIN="/path/to/mihomo" node mrs-convert.js domain input.mrs output.yaml
```

### 用 main 处理 YAML 配置

`apply-main.js` 使用 Node.js 执行脚本，并读取、输出 YAML。首次使用前安装依赖：

```sh
npm install
```

依次传入 JavaScript 脚本、输入 YAML 和输出 YAML。例如运行 `clash-script.js`，将 `example.yaml` 另存为测试配置；先创建 `test` 目录：

```sh
node apply-main.js clash-script.js example.yaml test/example.test.yaml
```

输入配置需要包含完整有效的节点。`example.yaml` 是结构参考，生成工具不会补全占位节点或修复过期的内核字段。

第一个参数也可以指定其他包含 `main(config)` 的脚本：

```sh
node apply-main.js /path/to/custom.js input.yaml output.yaml
```

工具将 YAML 解析成对象后传给 `main`，支持顶层函数或箭头函数，也传入输入文件名作为第二个参数 `profileName`。脚本需要返回配置对象；输出会重新排版，不保留原 YAML 注释。生成成功后才替换输出文件，读取、转换失败时保留已有输出。

这一步只生成配置。需要应用时，在客户端导入输出文件；也可以先用 `mihomo -t -f output.yaml` 校验。两个工具均要求输出目录已存在，并禁止将输出指向输入文件。运行 `node mrs-convert.js --help` 或 `node apply-main.js --help` 可查看用法。

### 用虚假连接检查规则命中

`test-routes.js` 默认用内置的六个 reject 节点执行同目录的 `clash-script.js`，依次生成测试 YAML、准备规则集、运行虚假连接测试。无需手工准备节点输入或运行配置。准备阶段会访问远程规则下载地址；匹配阶段的连接在临时核心内部结束，不向待测网站发起 TLS 或 HTTP 请求。脚本、本地规则文件和客户端状态不会被改写。

需要 Node.js 22+、本机 Mihomo，并在工具目录运行一次 `npm install`。内核查找方式与 `mrs-convert.js` 相同，可用 `MIHOMO_BIN` 指定路径。测试文件统一放在 `test/`（由 Git 忽略），先创建该目录，再创建自己的 `test/cases.yaml`：

```yaml
- name: OpenAI
  url: https://chatgpt.com/
  group: OpenAI
  ruleSet: OpenAI-Site
- name: 国内网站
  url: https://www.baidu.com/
  group: China
  ruleSet: China-Site
- name: Steam 商店
  url: https://store.steampowered.com/
  group: Steam
- name: Final 兜底
  url: https://example.com/
  group: Final
  rule: Match
  rulePayload: ""
```

`group` 是预期的规则目标组或 DIRECT，`name` 仅用于显示。可用以下字段进一步验证具体规则：

- `ruleSet`：要求命中指定规则集，等价于 `rule: RuleSet` 与对应的 `rulePayload`。
- `rule`：要求规则类型与连接详情中的 `rule` 字段一致，例如 `DomainSuffix`、`Match`；忽略大小写。
- `rulePayload`：要求规则内容完全一致，支持空字符串。例如前置规则 `DOMAIN-SUFFIX,example.org,DIRECT` 可用 `group: DIRECT`、`rule: DomainSuffix`、`rulePayload: example.org` 验证。

`ruleSet` 与 `rule`、`rulePayload` 二选一，不能同时填写。只填写 `group` 时不验证规则类型和内容。`url` 提供待测域名或真实 IP 及目标端口，支持 HTTP(S) 写法；路径不会被请求。原配置没有显式 MATCH 且所有规则均未匹配时，显示为 `Default → DIRECT`。

在 macOS / Linux 的 zsh、bash 或 Windows PowerShell 中运行：

```sh
node test-routes.js test/cases.yaml --secret='你的控制接口密钥'
```

内置节点名称为 `HK01`、`JP01`、`KR01`、`SG01`、`TW01`、`US01`，类型均为 `reject`，用于生成对应国家组。工具执行完整脚本，包含 `main` 外的 `prepend` 和辅助函数。

规则集按 `rule-providers` 的来源处理，全部准备完成后才启动测试：

- `type: http`：每次从 `url` 下载到临时目录，支持 `header`，单个下载最多等待 30 秒。不会使用客户端旧缓存；HTTP 错误、下载中断或内容无法被核心加载时，立即报错停止。
- `type: file`：将 `path` 指向的本地规则复制到临时目录。
- `type: inline`：直接使用配置中的 `payload`。

`--home` 用于指定本地规则文件和 GEOIP/GEOSITE 数据所在的核心工作目录；未指定时，在脚本目录及其上级目录查找。全部使用远程规则集且不需要额外地理数据时，可以省略。工具不会下载节点订阅。

每次运行会在**当前终端目录**的 `./temp/` 下创建独立的 `test-routes-XXXXXX/`。终端打印完整路径，结果报告中的 `workDir` 也记录该路径。主要产物如下：

| 产物 | 用途 |
|---|---|
| `test.yaml` | `main` 生成的完整配置，规则准备完成后更新为本地文件引用，保留原规则目标；使用 `--config` 时从输入配置生成 |
| `ruleset/` | 本次下载或复制的规则文件 |
| `mihomo.yaml` | 本次临时核心实际加载的配置，使用内部 reject 策略和临时端口 |

生成配置、准备规则和运行测试仍是独立阶段，共用一份 `test.yaml`；如果下载失败，该文件保留原始规则来源，便于排查。

测试结束或失败后只关闭临时核心，保留已产生的文件供检查；`temp/` 已被 Git 忽略，可自行删除。后续只想重新测试已准备好的规则时，使用对应的 `test.yaml`，不会再次访问远程规则下载地址：

```sh
node test-routes.js test/cases.yaml --config='./temp/test-routes-XXXXXX/test.yaml' --secret='你的控制接口密钥'
```

要测试指定 YAML 中的规则，用 `--config` 读取该配置，不执行 `clash-script.js`，也不会将配置加载到当前客户端。远程规则同样以本次下载内容为准；本地规则默认从配置目录及其上级目录查找：

```sh
node test-routes.js test/cases.yaml --config=test/test.yaml --home='/path/to/mihomo/data' --secret='你的控制接口密钥'
```

按原顺序匹配：域名规则本身不触发 DNS，遇到需要目的 IP 且允许解析的规则时才查询，遵循 `no-resolve`。已有 IP 或临时核心的 DNS 缓存可直接复用。

需要解析时，通过正在运行的 Mihomo 控制接口 `/dns/query` 获取真实 DNS 答案，避免将 fake-IP 监听端口返回的虚拟地址用于 IP 规则匹配。DNS 使用该核心当前的解析设置，可能按其策略经代理查询 DNS 服务；不连接待测网站。

控制接口默认 `http://127.0.0.1:9090`，可用 `--controller` 指定，优先于 `MIHOMO_CONTROLLER`。`--secret='密钥'` 或 `--secret '密钥'` 均可，优先于 `MIHOMO_SECRET`；`--secret=''` 显式忽略环境变量中的密钥。纯域名匹配用例不需要控制接口可用。完整参数示例：

```sh
node test-routes.js test/cases.yaml --home='/path/to/mihomo/data' --controller=http://127.0.0.1:9090 --secret='你的控制接口密钥'
```

参数可放在文件名之前或之后。配置路径包含空格时需加引号。

终端显示命中规则、目标策略、DNS 查询次数和断言结果，完整结果（含 DNS 返回的真实地址）默认保存到清单同目录的 `test/cases.results.json`，也可用第二个位置参数指定其他结果路径。结果目录需已存在，输出不能覆盖清单、待测配置或工具脚本；通过 `--secret` 提供的密钥不会写入报告。

测试串行执行，每项最多等待 15 秒。无法确认命中或 DNS 解析失败时标为“未确认”；DNS 失败后的兜底结果不会被误判为通过。退出码 0 表示全部断言通过，1 表示存在不符、未确认或执行错误。

虚拟输入只覆盖给定域名、真实 IP 和端口的 TCP 规则匹配。策略组内的选择与特殊出站行为、嗅探、进程规则、UDP/QUIC、网站可用性和实际出口均需另行验证。
