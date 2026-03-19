# Clash Subscription Converter Script

这是一个用于 Clash (Clash Verge Rev / FlClash 等) 内置 JavaScript 预处理（Script/Merge）功能的自动化脚本。它可以将仅包含节点的初始订阅配置自动转换为具有精细分流规则、按国家地区自动分组排序的高级配置。

同时为不具备 JavaScript 功能的客户端准备了功能接近的 YAML 文件。

## 功能

- 通过正则表达式自动识别节点名称，按国家分类并生成对应的 `url-test`（自动测速）策略组。（可自定义）
- 自动排除非国家或地区的信息节点，可自定义是否启用（默认禁用）
- 自动在匹配到的节点名称前加上对应的 Emoji 旗帜（如 `🇭🇰`）。
- 将节点按照国家重新排序，并支持自定义顺序。
- 使用远程规则，规则采用 `rule-set` 模式，按需添加规则集。
- 脚本内完全接管了 `proxy-groups`, `rule-providers` 和 `rules`，你的初始订阅仅需要包含有效的 `proxies` 节点列表。

## 如何使用

仅使用于 Mihomo (Clash Meta) 内核，需要客户端支持 JavaScript 脚本功能。

1. 从仓库或者 Release 里找到 `clash-script.js` 文件，或者使用下面的链接导入

   ``` url
   https://cdn.jsdmirror.com/gh/OCote5721/Clash-Subscription-Converter-Script@main/clash-script.js  
   ```
   ``` url
   https://raw.githubusercontent.com/OCote5721/Clash-Subscription-Converter-Script/main/clash-script.js
   ```
   
   
   
2. 复制脚本内完整的代码，并粘贴到客户端的 JavaScript 扩展脚本内。

   

## 个性化定制

如果你想将这个脚本用于更广泛的场景，可以直接修改 `clash-script.js` 开头的几个变量：

###  1. 选择是否保留特殊节点

选择是否在`主代理`中保留 "剩余流量"、"套餐到期" 等提示信息类节点

```javascript
// true 则保留在主代理中，false 则完全不显示这些节点  
const SHOW_INFO_NODES_IN_MAIN = true; 
```

 选择是否在主代理中保留 `DIRECT` (直连) 选项

```javascript
// true 则保留，false 则去除
const SHOW_DIRECT_IN_MAIN = true;
```

### 2. 添加更多国家/地区

在 `countryMapping` 数组中添加新的正则表达式和对应的旗帜：
```javascript
const countryMapping = [
  // ...
  { regex: /(🇰🇷|\bKR\b|Korea|韩国|首尔)/i, flag: "🇰🇷", name: "KR" },
  { regex: /(🇸🇬|\bSG\b|Singapore|新加坡|狮城)/i, flag: "🇸🇬", name: "SG" }, // 添加新的国家
];
```
*注：脚本具有容错性，如果订阅中没有匹配到某个国家，则不会生成对应的空白节点组。*

### 3. 更改排序优先级
修改 `sortOrder` 数组来决定策略组和节点在列表中的展示顺序，并且此列表将用于控制生成的国家分组：
```javascript
const sortOrder = ["HK", "JP", "KR", "SG", "TW", "US"];
```

### 4. 调整应用分流组行为
如果你想改变某个特定应用（例如“中国大陆网站”）的策略，可以在 `appGroupNames.forEach` 循环中修改逻辑：
```javascript
let appProxies = [...proxiesForApp];
if (appName === "中国大陆网站" || appName === "Bilibili") {
    // 将 DIRECT 放在最前面
    appProxies = ["DIRECT", "主代理", ...countryGroupNames];
}
```



## YAML 文件说明

Clash Meta For Android 不支持 JavaScript 脚本扩展，因此准备了 YAML 模板文件 `proxy-providers.yaml`，按照下面的说明修改后直接导入客户端。

### 1. 填入订阅链接

在 `url` 里填入订阅链接，并在 `path` 里填写保存的文件名

``` yaml
    url: ""
    path: ./proxies/.yaml
```

### 2. 添加更多国家和地区

如果原始订阅包含旗帜，需要在此处增加对应的旗帜防止重复生成

``` yaml
- pattern: "^[🇭🇰🇯🇵🇰🇷🇸🇬🇹🇼🇺🇸🇬🇧🇩🇪🇫🇷🇨🇦🇦🇺🇨🇳]+\\s*"
  target: ""
```

然后仿照模板在后面增加正则表达式

``` yaml
- pattern: '(?i)^(.*(🇭🇰|\bHK\b|Hong.*Kong|香港).*)$'
  target: '🇭🇰 $1'
```

### 3. 增加国家分组

由于 YAML 无法使用判别式自动生成国家分组，需要手动在后面补充

``` yaml
  - name: HK
    type: url-test
    url: "https://cp.cloudflare.com"
    interval: 180
    lazy: false
    include-all: true
    filter: "🇭🇰"
```

### 4. 链接下载

可使用下面的链接下载，但不要去更新，更新后会覆盖修改内容。

``` url
https://raw.githubusercontent.com/OCote5721/Clash-Subscription-Converter-Script/main/proxy-providers.yaml
```
``` url
https://cdn.jsdmirror.com/gh/OCote5721/Clash-Subscription-Converter-Script@main/proxy-providers.yaml  
```



##  文件说明

- `clash-script.js`: 核心处理脚本，用于客户端内置 JS 预处理。

- `proxy-providers.yaml` : 功能相近 YAML 模板文件。

- `example.yaml`: 经过 JS 脚本处理后的参考文件。

  
