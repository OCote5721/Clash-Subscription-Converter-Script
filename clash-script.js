function main(config) {
  // ================= 基础配置开关 =================
  // 是否在主代理中保留 "剩余流量"、"套餐到期" 等提示信息类节点
  // true 则保留在主代理中，false 则完全不显示这些节点
  const SHOW_INFO_NODES_IN_MAIN = true;
  
  // 是否在主代理中保留 "DIRECT" (直连) 选项
  // true 则保留，false 则去除
  const SHOW_DIRECT_IN_MAIN = false;

  // 是否按原 hosts 映射改写节点 server（不联网查询 DNS）
  // true 则应用映射，false 则保留原 server；两种情况都不复制原 hosts
  // IP 数组取第一个 IPv4（本脚本关闭 IPv6）；无 IPv4 时取第一项
  const APPLY_ORIGINAL_HOSTS = true;

  // 国家节点组的类型："url-test" (自动选择最低延迟) 或 "select" (手动选择)
  const COUNTRY_GROUP_TYPE = "url-test";

  // 预定义的国家正则匹配和对应的旗帜
  // 你可以在这里继续添加你需要分类的国家或地区，如果没有匹配到相应的节点，则不会生成该分组
  // 提示：去除了 ^ 开头限制，以便更好地匹配已经带有旗帜或其他前缀的节点名称
  const countryMapping = [
    { regex: /(🇭🇰|HK|Hong.*Kong|香港)/, flag: "🇭🇰", name: "HK" },
    { regex: /(🇯🇵|JP|Japan|日本|东京|大阪)/, flag: "🇯🇵", name: "JP" },
    { regex: /(🇰🇷|KR|Korea|韩国|首尔)/, flag: "🇰🇷", name: "KR" },
    { regex: /(🇸🇬|SG|Singapore|新加坡|狮城)/, flag: "🇸🇬", name: "SG" },
    { regex: /(🇹🇼|TW|Taiwan|台湾|新北|彰化|台北)/, flag: "🇹🇼", name: "TW" },
    { regex: /(🇺🇸|US|America|United.*States|美国|洛杉矶|硅谷|西雅图|凤凰城|圣何塞)/, flag: "🇺🇸", name: "US" },
    { regex: /(🇬🇧|UK|Britain|United.*Kingdom|英国|伦敦)/, flag: "🇬🇧", name: "UK" },
    { regex: /(🇩🇪|DE|Germany|德国|法兰克福)/, flag: "🇩🇪", name: "DE" },
    { regex: /(🇫🇷|FR|France|法国|巴黎)/, flag: "🇫🇷", name: "FR" },
    { regex: /(🇨🇦|CA|Canada|加拿大)/, flag: "🇨🇦", name: "CA" },
    { regex: /(🇦🇺|AU|Australia|澳大利亚|悉尼)/, flag: "🇦🇺", name: "AU" },
    // { regex: /(🇲🇾|MY|Malaysia|马来西亚)/, flag: "🇲🇾", name: "MY" },
    // { regex: /(🇷🇺|RU|Russia|俄罗斯|莫斯科)/, flag: "🇷🇺", name: "RU" },
    // { regex: /(🇦🇪|AE|Dubai|迪拜)/, flag: "🇦🇪", name: "AE" },
    // { regex: /(🇧🇷|BR|Brazil|巴西|圣保罗)/, flag: "🇧🇷", name: "BR" },
    // { regex: /(🇮🇳|IN|India|印度|孟买|海得拉巴)/, flag: "🇮🇳", name: "IN" },
    // { regex: /(🇲🇽|MX|Mexico|墨西哥|克雷塔罗)/, flag: "🇲🇽", name: "MX" },
    // { regex: /(🇪🇸|ES|Spain|西班牙|马德里)/, flag: "🇪🇸", name: "ES" },
  ];
  

  // 定义排序优先级，同时作为允许生成国家组的白名单
  const sortOrder = ["HK", "JP", "KR", "SG", "TW", "US"];

  // 定义分流组的显示顺序，同时作为允许生成分流组的白名单
  // 调整数组中的顺序即可排序；删除或注释某项即可关闭对应分流组
  //"Google", "Microsoft", "PayPal", "OpenAI", "Twitter", "Youtube", "Netflix", "Disney", "Hbomax", "Apple", "Spotify", "Steam", "Telegram", "Discord", "TikTok", "GoogleFCM", "Speedtest", "Bilibili", "Bahamut", "China", "GFWList", "Final"
  const appGroupOrder = [
    "Google", "Microsoft", "PayPal", "OpenAI", "Twitter", "Youtube", "Netflix", "Disney", "Hbomax",
    "Apple", "Spotify", "Steam", "Telegram", "Discord", "TikTok",
    "GoogleFCM", "Speedtest", "Bilibili", "Bahamut", "China", "GFWList", "Final"
  ];

  // =================================================


  if (!Array.isArray(config.proxies) || config.proxies.length === 0) {
    throw new Error("覆写脚本需要非空的 proxies 节点列表，不支持仅含 proxy-providers 的配置。");
  }
  // 先复制节点，校验失败时不改动输入节点的名称和引用。
  const proxies = config.proxies.map(proxy => ({ ...proxy }));
  if (APPLY_ORIGINAL_HOSTS && config.hosts != null) {
    const isIP = value => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":");
    const normalizeDomain = value => value.toLowerCase().replace(/\.$/, "");
    const entries = Object.entries(config.hosts).map(([pattern, value]) => {
      const key = normalizeDomain(pattern);
      const labels = key.replace(/^\+?\./, "").split(".");
      return { key, value, labels, exact: !key.startsWith(".") && !key.startsWith("+.") && !key.includes("*") };
    }).sort((a, b) => Number(b.exact) - Number(a.exact)
      || b.labels.length - a.labels.length
      || b.labels.filter(x => x !== "*").length - a.labels.filter(x => x !== "*").length);
    const matches = (entry, domain) => {
      const { key, labels } = entry;
      if (key.startsWith("+.")) return domain === key.slice(2) || domain.endsWith(key.slice(1));
      if (key.startsWith(".")) return domain.endsWith(key);
      const parts = domain.split(".");
      return labels.length === parts.length && labels.every((part, i) => part === "*" || part === parts[i]);
    };
    const cache = new Map();
    const resolveHost = original => {
      const key = normalizeDomain(original);
      if (cache.has(key)) return cache.get(key);
      const seen = new Set();
      let current = original;
      while (!isIP(current)) {
        const domain = normalizeDomain(current);
        if (seen.has(domain)) throw new Error(`原 hosts 存在循环映射：${original}`);
        seen.add(domain);
        const entry = entries.find(item => matches(item, domain));
        if (!entry) break;
        let target = entry.value;
        if (Array.isArray(target)) {
          target = target.find(value => typeof value === "string" && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) || target[0];
        }
        if (typeof target !== "string" || !target.trim()) {
          throw new Error(`原 hosts 映射值无效：${entry.key}`);
        }
        current = target.trim();
      }
      cache.set(key, current);
      return current;
    };
    proxies.forEach(proxy => {
      if (typeof proxy.server !== "string" || isIP(proxy.server)) return;
      const original = proxy.server;
      const server = resolveHost(original);
      if (server === original) return;
      // 改变连接地址时，保留原 TLS 名称；显式配置的 SNI 不变。
      if (["trojan", "hysteria", "hysteria2", "tuic", "anytls"].includes(proxy.type)) {
        if (!proxy.sni) proxy.sni = original;
      } else if (["vmess", "vless", "http", "socks5"].includes(proxy.type) && proxy.tls) {
        if (!proxy.servername) proxy.servername = original;
      }
      if (proxy.network === "ws") {
        const options = proxy["ws-opts"] || {};
        const headers = options.headers || {};
        if (!Object.keys(headers).some(key => key.toLowerCase() === "host")) {
          proxy["ws-opts"] = { ...options, headers: { ...headers, Host: proxy.sni || proxy.servername || original } };
        }
      }
      proxy.server = server;
    });
  }
  const originalNames = new Set();
  proxies.forEach(proxy => {
    if (typeof proxy.name !== "string" || !proxy.name.trim()) {
      throw new Error("节点名称必须是非空字符串。");
    }
    if (originalNames.has(proxy.name)) {
      throw new Error(`输入节点名称重复，无法确定引用目标：${proxy.name}`);
    }
    originalNames.add(proxy.name);
  });
  const builtInNames = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];
  const usedNames = new Set([...builtInNames, "主代理", ...sortOrder, ...appGroupOrder]);
  const renamedNames = new Map();
  const uniqueName = (base, original) => {
    let name = base;
    let suffix = 2;
    while (usedNames.has(name) || (name !== original && originalNames.has(name))) {
      name = `${base} (${suffix++})`;
    }
    usedNames.add(name);
    renamedNames.set(original, name);
    return name;
  };
  
  // 用于提取信息类节点（如剩余流量、套餐到期）
  const infoNodes = [];
  const normalProxies = [];

  proxies.forEach(proxy => {
    // 匹配常见的流量/过期时间等提示性节点
    if (/剩余流量|套餐到期|到期时间|过期时间|有效时间|Traffic|Expire/i.test(proxy.name)) {
      proxy.name = uniqueName(proxy.name, proxy.name);
      infoNodes.push(proxy.name);
    } else {
      normalProxies.push(proxy);
    }
  });
  if (normalProxies.length === 0) {
    throw new Error("订阅中只有提示信息节点，没有可用的普通节点。");
  }
  
  // 用于存储检测到的国家节点
  const countryNodes = {};
  const otherProxyNames = [];
  
  // 1. 处理节点：匹配国家 -> 清理干扰标记 -> 重命名(加旗帜) -> 收集国家分类
  const cnFlagRegex = /\u{1F1E8}\u{1F1F3}/gu; // 🇨🇳
  const normalizeFlagSpacing = name =>
    name.replace(/^([\u{1F1E6}-\u{1F1FF}]{2})\s*/u, "$1 ");

  normalProxies.forEach(proxy => {
    const originalName = proxy.name;

    let matchedMapping = null;
    for (const mapping of countryMapping) {
      if (mapping.regex.test(originalName)) {
        matchedMapping = mapping;
        break;
      }
    }

    // 1.1 只移除 🇨🇳 旗帜，保留 CN2、China、中国等名称文本。
    const cleanedName = originalName
      .replace(cnFlagRegex, "")                 // 移除 🇨🇳
      .replace(/\s+/g, " ")
      .trim();

    if (matchedMapping) {
      // 1.2 重命名：如果已是目标旗帜开头则不重复添加
      if (!cleanedName.startsWith(matchedMapping.flag)) {
        proxy.name = cleanedName ? `${matchedMapping.flag} ${cleanedName}` : matchedMapping.flag;
      } else {
        proxy.name = cleanedName;
      }
      proxy.name = uniqueName(normalizeFlagSpacing(proxy.name), originalName);
      
      const groupName = matchedMapping.name;

      // 1.3 分组：仅当该国家在 sortOrder 中时，才加入国家分类组
      if (sortOrder.includes(groupName)) {
        if (!countryNodes[groupName]) {
          countryNodes[groupName] = [];
        }
        countryNodes[groupName].push(proxy.name);
      } else {
        otherProxyNames.push(proxy.name);
      }
    } else {
      proxy.name = cleanedName || "未命名节点";
      proxy.name = uniqueName(normalizeFlagSpacing(proxy.name), originalName);
      otherProxyNames.push(proxy.name);
    }
  });

  // 获取所有存在节点的国家组名，并按照指定顺序排序
  let countryGroupNames = Object.keys(countryNodes);
  countryGroupNames.sort((a, b) => {
    const indexA = sortOrder.indexOf(a);
    const indexB = sortOrder.indexOf(b);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    } else if (indexA !== -1) {
      return -1;
    } else if (indexB !== -1) {
      return 1;
    } else {
      return a.localeCompare(b);
    }
  });

  // 生成排好序的国家节点组
  const countryProxyGroups = [];
  countryGroupNames.forEach(groupName => {
    countryProxyGroups.push({
      name: groupName,
      type: COUNTRY_GROUP_TYPE,
      url: "https://www.gstatic.com/generate_204",
      interval: 600,
      lazy: false,
      proxies: countryNodes[groupName]
    });
  });

  // 主代理中按国家组顺序衔接；每个国家内部保留输入顺序
  const allProxyNames = [
    ...sortOrder.flatMap(groupName => countryNodes[groupName] || []),
    ...otherProxyNames
  ];

  // 对 config.proxies 应用与主代理相同的排序逻辑，使全局模式也能按国家分组排序
  const proxyRank = new Map([...allProxyNames, ...infoNodes].map((name, index) => [name, index]));
  const sortedProxies = proxies.slice().sort((a, b) => proxyRank.get(a.name) - proxyRank.get(b.name));

  // 2. 构建新的代理组
  const newProxyGroups = [];

  // 主代理组：直接使用排序后的 config.proxies
  const mainProxyGroup = {
    name: "主代理",
    type: "select",
    proxies: [
      ...countryGroupNames,
      ...(SHOW_INFO_NODES_IN_MAIN ? infoNodes : []),
      ...(SHOW_DIRECT_IN_MAIN ? ["DIRECT"] : []),
      ...sortedProxies
        .filter(p => !infoNodes.includes(p.name))
        .map(p => p.name)
    ]
  };
  newProxyGroups.push(mainProxyGroup);

  // 国家节点组紧随“主代理”，位于所有应用分类策略组之前
  newProxyGroups.push(...countryProxyGroups);

  // 按顶部白名单中配置的顺序生成应用分类策略组
  const enabledAppGroups = new Set(appGroupOrder);
  appGroupOrder.forEach(appName => {
    let appProxies = ["主代理", "DIRECT", ...countryGroupNames];
    
    if (appName === "China" || appName === "Bilibili" || appName === "Apple") {
        appProxies = ["DIRECT", "主代理", ...countryGroupNames];
    }

    if (appName === "Final") {
        appProxies = ["主代理", "DIRECT"];
    }

    newProxyGroups.push({
      name: appName,
      type: "select",
      proxies: appProxies
    });
  });
  
  // 更新节点间的链式代理引用；旧策略组被覆盖后，失效引用必须明确报错。
  const validTargets = new Set([...builtInNames, ...proxies.map(p => p.name), ...newProxyGroups.map(g => g.name)]);
  proxies.forEach(proxy => {
    const target = proxy["dialer-proxy"];
    if (target == null || target === "") return;
    const updatedTarget = renamedNames.get(target) || target;
    if (!validTargets.has(updatedTarget)) {
      throw new Error(`节点「${proxy.name}」的 dialer-proxy 目标不存在或已被覆写删除：${target}`);
    }
    proxy["dialer-proxy"] = updatedTarget;
  });
  // 同时检查通过策略组间接形成的循环，避免节点依赖包含自身的策略组。
  const dependencies = new Map([
    ...proxies.map(p => [p.name, p["dialer-proxy"] ? [p["dialer-proxy"]] : []]),
    ...newProxyGroups.map(g => [g.name, g.proxies])
  ]);
  const visiting = new Set();
  const visited = new Set();
  const checkCycle = name => {
    if (visiting.has(name)) throw new Error(`代理引用存在循环：${[...visiting, name].join(" -> ")}`);
    if (visited.has(name) || !dependencies.has(name)) return;
    visiting.add(name);
    dependencies.get(name).forEach(checkCycle);
    visiting.delete(name);
    visited.add(name);
  };
  dependencies.forEach((_, name) => checkCycle(name));
  config.proxies = sortedProxies;

  // 3. 构建新的 Rule-Providers
  const ruleProviders = {
    "Apple-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Apple/Apple-IP.mrs",
      path: "./ruleset/Apple-IP.mrs",
      interval: 604800
    },
    "Apple-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Apple/Apple-Site.mrs",
      path: "./ruleset/Apple-Site.mrs",
      interval: 604800
    },
    "Bahamut-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Bahamut/Bahamut-Site.mrs",
      path: "./ruleset/Bahamut-Site.mrs",
      interval: 604800
    },
    "Bilibili-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Bilibili/Bilibili-IP.mrs",
      path: "./ruleset/Bilibili-IP.mrs",
      interval: 604800
    },
    "Bilibili-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Bilibili/Bilibili-Site.mrs",
      path: "./ruleset/Bilibili-Site.mrs",
      interval: 604800
    },
    "China-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/China/China-IP.mrs",
      path: "./ruleset/China-IP.mrs",
      interval: 604800
    },
    "China-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/China/China-Site.mrs",
      path: "./ruleset/China-Site.mrs",
      interval: 604800
    },
    "Discord-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Discord/Discord-Site.mrs",
      path: "./ruleset/Discord-Site.mrs",
      interval: 604800
    },
    "Disney-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/disney.mrs",
      path: "./ruleset/Disney-Site.mrs",
      interval: 604800
    },
    "GFWList-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/GFWList/GFWList-Site.mrs",
      path: "./ruleset/GFWList-Site.mrs",
      interval: 604800
    },
    "Google-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Google/Google-IP.mrs",
      path: "./ruleset/Google-IP.mrs",
      interval: 604800
    },
    "Google-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Google/Google-Site.mrs",
      path: "./ruleset/Google-Site.mrs",
      interval: 604800
    },
    "GoogleFCM-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/GoogleFCM/GoogleFCM-Site.mrs",
      path: "./ruleset/GoogleFCM-Site.mrs",
      interval: 604800
    },
    "Hbomax-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/hbo.mrs",
      path: "./ruleset/Hbomax-Site.mrs",
    interval: 604800
    },
    "Local-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Local/Local-IP.mrs",
      path: "./ruleset/Local-IP.mrs",
      interval: 604800
    },
    "Microsoft-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Microsoft/Microsoft-Site.mrs",
      path: "./ruleset/Microsoft-Site.mrs",
      interval: 604800
    },
    "Netflix-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Netflix/Netflix-Site.mrs",
      path: "./ruleset/Netflix-Site.mrs",
      interval: 604800
    },
    "Netflix-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Netflix/Netflix-IP.mrs",
      path: "./ruleset/Netflix-IP.mrs",
      interval: 604800
    },
    "OpenAI-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/OpenAI/OpenAI-IP.mrs",
      path: "./ruleset/OpenAI-IP.mrs",
      interval: 604800
    },
    "OpenAI-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/OpenAI/OpenAI-Site.mrs",
      path: "./ruleset/OpenAI-Site.mrs",
      interval: 604800
    },
    "PayPal-Site":{
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/paypal.mrs",
      path: "./ruleset/PayPal-Site.mrs",
      interval: 604800
    },
    "Speedtest-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Speedtest/Speedtest-Site.mrs",
      path: "./ruleset/Speedtest-Site.mrs",
      interval: 604800
    },
    "Spotify-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Spotify/Spotify-IP.mrs",
      path: "./ruleset/Spotify-IP.mrs",
      interval: 604800
    },
    "Spotify-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Spotify/Spotify-Site.mrs",
      path: "./ruleset/Spotify-Site.mrs",
      interval: 604800
    },
    "Steam-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Steam/Steam-Site.mrs",
      path: "./ruleset/Steam-Site.mrs",
      interval: 604800
    },
    "Telegram-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Telegram/Telegram-IP.mrs",
      path: "./ruleset/Telegram-IP.mrs",
      interval: 604800
    },
    "Telegram-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Telegram/Telegram-Site.mrs",
      path: "./ruleset/Telegram-Site.mrs",
      interval: 604800
    },
    "TikTok-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/TikTok/TikTok-Site.mrs",
      path: "./ruleset/TikTok-Site.mrs",
      interval: 604800
    },
    "Twitter-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/twitter.mrs",
      path: "./ruleset/Twitter-IP.mrs",
      interval: 604800
    },
    "Twitter-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/twitter.mrs",
      path: "./ruleset/Twitter-Site.mrs",
      interval: 604800
    },
    "Youtube-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/youtube.mrs",
      path: "./ruleset/Youtube-Site.mrs",
      interval: 604800
    },
  };

  // 4. 构建新的 Rules
  const builtInRuleTargets = new Set([
    "DIRECT", "REJECT", "REJECT-DROP", "PASS", "主代理", ...countryGroupNames
  ]);

  // 被关闭分流组所对应的规则自动回退到“主代理”，避免引用不存在的策略组
  const rules = [
    // "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT",
    "DOMAIN,ntp.aliyun.com,DIRECT",
    "DOMAIN-KEYWORD,msftconnecttest.com,主代理",
    "DOMAIN-KEYWORD,msftncsi.com,主代理",
    "RULE-SET,GoogleFCM-Site,GoogleFCM",
    "DOMAIN-KEYWORD,googleapis,Google",
    "RULE-SET,Bahamut-Site,Bahamut",
    "RULE-SET,Bilibili-Site,Bilibili",
    "RULE-SET,PayPal-Site,PayPal",
    "RULE-SET,Discord-Site,Discord",
    "RULE-SET,Netflix-Site,Netflix",
    "RULE-SET,OpenAI-Site,OpenAI",
    "RULE-SET,Speedtest-Site,Speedtest",
    "RULE-SET,Spotify-Site,Spotify",
    "RULE-SET,Steam-Site,Steam",
    "RULE-SET,Telegram-Site,Telegram",
    "RULE-SET,TikTok-Site,TikTok",
    "RULE-SET,Twitter-Site,Twitter",
    "RULE-SET,Youtube-Site,Youtube",
    "RULE-SET,Disney-Site,Disney",
    "RULE-SET,Hbomax-Site,Hbomax",
    "RULE-SET,Apple-Site,Apple",
    "RULE-SET,Google-Site,Google",
    "RULE-SET,Microsoft-Site,Microsoft",
    "RULE-SET,GFWList-Site,GFWList",
    "RULE-SET,China-Site,China",
    "RULE-SET,Local-IP,DIRECT,no-resolve",
    "RULE-SET,Bilibili-IP,Bilibili",
    "RULE-SET,Netflix-IP,Netflix",
    "RULE-SET,OpenAI-IP,OpenAI",
    "RULE-SET,Spotify-IP,Spotify",
    "RULE-SET,Telegram-IP,Telegram",
    "RULE-SET,Twitter-IP,Twitter",
    "RULE-SET,Apple-IP,Apple",
    "RULE-SET,Google-IP,Google",
    "RULE-SET,China-IP,China",
    "MATCH,Final"
  ].map(rule => {
    const parts = rule.split(",");
    const targetIndex = parts[parts.length - 1] === "no-resolve"
      ? parts.length - 2
      : parts.length - 1;
    const target = parts[targetIndex];

    if (!builtInRuleTargets.has(target) && !enabledAppGroups.has(target)) {
      parts[targetIndex] = "主代理";
    }

    return parts.join(",");
  });
  
  // 5. 注入全局配置并重置策略组与规则
  config["port"] = 7890;
  config["socks-port"] = 7891;
  config["mixed-port"] = 7892;
  config["allow-lan"] = false;
  config["bind-address"] = "*";
  config["mode"] = "rule";
  config["log-level"] = "info";
  config["ipv6"] = false;
  config["find-process-mode"] = "strict";
  config["external-controller"] = "127.0.0.1:9090";
  config["profile"] = {
    "store-selected": true,
    "store-fake-ip": true
  };
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["global-ua"] = "clash.meta";

  config["sniffer"] = {
    "enable": true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": true,
    "sniff": {
      "HTTP": {
        "ports": [80, "8080-8880"],
        "override-destination": true
      },
      "TLS": {
        "ports": [443, 8443]
      },
      "QUIC": {
        "ports": [443, 8443]
      }
    },
    "skip-domain": [
      "Mijia Cloud"
    ]
  };

  config["ntp"] = {
    "enable": true,
    "write-to-system": false,
    "server": "ntp.aliyun.com",
    "port": 123,
    "interval": 30
  };

  config["tun"] = {
    "enable": true,
    "stack": "system",
    "auto-route": true,
    "auto-detect-interface": true,
    "strict-route": true,
    "dns-hijack": [
      "any:53",
      "tcp://any:53"
    ],
    "device": "SakuraiTunnel",
    "mtu": 9000,
    "endpoint-independent-nat": true
  };

  config["dns"] = {
    "enable": true,
    "prefer-h3": false,
    "listen": "0.0.0.0:1053",
    "ipv6": false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": [
      "+.lan",
      "+.local",
      "localhost.ptlogin2.qq.com",
      "+.msftconnecttest.com",
      "+.msftncsi.com",
      "+.googleapis.com",
      "+.googleapis.cn",
      "alt1-mtalk.google.com",
      "alt2-mtalk.google.com",
      "alt3-mtalk.google.com",
      "alt4-mtalk.google.com",
      "alt5-mtalk.google.com",
      "alt6-mtalk.google.com",
      "alt7-mtalk.google.com",
      "alt8-mtalk.google.com",
      "mtalk.google.com"
    ],
    "use-hosts": true,
    "default-nameserver": [
      "114.114.114.114#DIRECT",
      "223.5.5.5#DIRECT",
      "119.29.29.29#DIRECT",
      "180.76.76.76#DIRECT",
      "180.184.1.1#DIRECT"
    ],
    "proxy-server-nameserver": [
      "https://dns.alidns.com/dns-query#DIRECT",
      "https://doh.pub/dns-query#DIRECT",
      "https://doh.onedns.net/dns-query#DIRECT"
    ],
    "nameserver": [
      "https://cloudflare-dns.com/dns-query#主代理"
    ],
    "nameserver-policy": {
      "ntp.aliyun.com": "https://dns.alidns.com/dns-query#DIRECT",
      "+.msftconnecttest.com,+.msftncsi.com": "https://cloudflare-dns.com/dns-query#主代理",
      "+.googleapis.com,+.googleapis.cn": "https://cloudflare-dns.com/dns-query#Google",
      "rule-set:Bahamut-Site": "https://cloudflare-dns.com/dns-query#Bahamut",
      "rule-set:Bilibili-Site": "https://dns.alidns.com/dns-query#Bilibili",
      "rule-set:Discord-Site": "https://cloudflare-dns.com/dns-query#Discord",
      "rule-set:Disney-Site": "https://cloudflare-dns.com/dns-query#Disney",
      "rule-set:GoogleFCM-Site": "https://cloudflare-dns.com/dns-query#GoogleFCM",
      "rule-set:Hbomax-Site": "https://cloudflare-dns.com/dns-query#Hbomax",
      "rule-set:Netflix-Site": "https://cloudflare-dns.com/dns-query#Netflix",
      "rule-set:OpenAI-Site": "https://cloudflare-dns.com/dns-query#OpenAI",
      "rule-set:PayPal-Site": "https://cloudflare-dns.com/dns-query#PayPal",
      "rule-set:Speedtest-Site": "https://cloudflare-dns.com/dns-query#Speedtest",
      "rule-set:Spotify-Site": "https://cloudflare-dns.com/dns-query#Spotify",
      "rule-set:Steam-Site": "https://doh.pub/dns-query#Steam",
      "rule-set:Telegram-Site": "https://cloudflare-dns.com/dns-query#Telegram",
      "rule-set:TikTok-Site": "https://cloudflare-dns.com/dns-query#TikTok",
      "rule-set:Twitter-Site": "https://cloudflare-dns.com/dns-query#Twitter",
      "rule-set:Youtube-Site": "https://cloudflare-dns.com/dns-query#Youtube",
      "rule-set:Apple-Site": "https://doh.pub/dns-query#Apple",
      "rule-set:Google-Site": "https://cloudflare-dns.com/dns-query#Google",
      "rule-set:Microsoft-Site": "https://doh.pub/dns-query#Microsoft",
      "rule-set:GFWList-Site": "https://cloudflare-dns.com/dns-query#GFWList",
      "rule-set:China-Site": "https://dns.alidns.com/dns-query#China"
    }
  };

  // 被关闭分流组所对应的 DNS 策略同样回退到“主代理”
  Object.keys(config["dns"]["nameserver-policy"]).forEach(policy => {
    config["dns"]["nameserver-policy"][policy] =
      config["dns"]["nameserver-policy"][policy].replace(/#([^#]+)$/, (match, target) => {
        if (builtInRuleTargets.has(target) || enabledAppGroups.has(target)) {
          return match;
        }
        return "#主代理";
      });
  });

  // 6. 将构建好的对象重新赋给 config
  config["proxy-groups"] = newProxyGroups;
  config["rule-providers"] = ruleProviders;
  config.rules = rules;

  // 节点已应用 hosts 的结果，不再将原映射表写入输出配置。
  delete config.hosts;

  return config;
}
