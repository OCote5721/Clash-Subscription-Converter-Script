# Clash Subscription Converter Script

这是一个用于 Clash (Clash Verge Rev / FlClash 等) 内置 JavaScript 预处理（Script/Merge）功能的自动化脚本。它可以将仅包含节点的初始订阅配置 (`profile.yaml`) 自动转换为具有精细分流规则、按国家地区自动分组排序的高级配置。

## 💡 开发初衷

本项目最初是为了解决某些机场提供的默认节点组和分流规则不符合个人使用习惯的问题。传统的第三方在线订阅转换途径存在诸多弊端：
- **隐私风险**：存在订阅链接泄露的风险。
- **转换失败**：部分机场的订阅链接为“阅后即焚”，导致第三方转换服务无法拉取。
- **被动封锁**：越来越多的机场开始主动屏蔽已知的在线订阅转换器 IP。

使用本项目，**所有的解析和转换工作都在你的本地客户端内完成**。只要你的 Clash 客户端支持 JavaScript 预处理脚本，即可实现安全、私密、高度自定义的订阅转换。

## ✨ 特性

- **🌍 自动国家分组**：通过正则表达式自动识别节点名称，按国家（如 HK, TW, JP, SG, US, KR 等）分类并生成对应的 `url-test`（自动测速）策略组。
- **🚩 智能添加旗帜**：自动在匹配到的节点名称前加上对应的 Emoji 旗帜（如 `🇭🇰`），且保证节点组名纯净（无图标），保持界面整洁。
- **🔀 智能排序逻辑**：
  - 国家节点组优先级排序：默认按照 `HK -> JP -> KR -> SG -> TW -> US` 顺序排列。
  - 零散节点排序：在「主代理」组中，节点同样按照国家优先级排序，未能识别的节点会自动归入 "others" 放在最后，确保长列表井然有序。
- **🛠️ 强力分流规则注入**：内置常用的 Rule-Providers（包含 Apple, Google, Microsoft, Netflix, Steam, Bilibili 等），直接在脚本内硬编码注入，**并且采用远端分流规则集，配置能够自动保持最新，无需频繁更新分流规则**。
- **🎯 纯净代理组**：移除了传统配置中冗余的“自动选择”和“负载均衡”，直接将国家组和所有具体节点展示在「主代理」和各个应用策略组中，并在合适的位置插入 `DIRECT` 直连。

## 🚀 如何使用

本项目支持所有**具备 JavaScript 预处理**的 Clash 客户端中使用。以 **Clash Verge Rev** 为例：

1. 打开 Clash Verge Rev 的 **订阅 (Subscriptions)** 页面。
2. 右键点击你的基础节点订阅，选择 **编辑 (Edit)**。
3. 找到 **扩展脚本 (Extend Script)** 选项。
4. 将本项目中的 `clash-script.js` 文件内容完整复制并粘贴进去，或者指定本地该 JS 文件的路径。
5. 保存并更新订阅。客户端在拉取节点后，会自动执行此脚本进行规则注入和节点重组。

> [!NOTE]
>
> 由于脚本内完全接管了 `proxy-groups`, `rule-providers` 和 `rules`，你的初始订阅仅需要包含有效的 `proxies` 节点列表即可。

## ⚙️ 个性化定制

如果你想将这个脚本用于更广泛的场景，可以直接修改 `clash-script.js` 开头的几个变量：

### 1. 添加更多国家/地区
在 `countryMapping` 数组中添加新的正则表达式和对应的旗帜：
```javascript
const countryMapping = [
  // ...
  { regex: /(🇰🇷|KR|Korea|韩国|首尔)/i, flag: "🇰🇷", name: "KR" },
  { regex: /(🇸🇬|SG|Singapore|新加坡|狮城)/i, flag: "🇸🇬", name: "SG" }, // 添加新的国家
];
```
*注：脚本具有容错性，如果订阅中没有匹配到某个国家，则不会生成对应的空白节点组。*

### 2. 更改排序优先级
修改 `sortOrder` 数组来决定策略组和节点在列表中的展示顺序：
```javascript
const sortOrder = ["HK", "JP", "KR", "SG", "TW", "US"];
```

### 3. 调整应用分流组行为
如果你想改变某个特定应用（例如“中国大陆网站”）的策略，可以在 `appGroupNames.forEach` 循环中修改逻辑：
```javascript
let appProxies = [...proxiesForApp];
if (appName === "中国大陆网站" || appName === "Bilibili") {
    // 将 DIRECT 放在最前面
    appProxies = ["DIRECT", "主代理", ...countryGroupNames];
}
```

## 📝 文件说明

- `clash-script.js`: 核心处理脚本，用于客户端内置 JS 预处理。
- `config-clash.yaml` : 分流规则模板。（感谢 MITCE 机场的配置文件作为参考）
- `profile.yaml` : 已脱敏的基础订阅文件结构示例，供开发测试使用。

## 📄 License

MIT License
