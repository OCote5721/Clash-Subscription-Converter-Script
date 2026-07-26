function main(config) {
  // ================= 基础配置开关 =================
  // 是否在主代理中保留 "剩余流量"、"套餐到期" 等提示信息类节点
  // true 则保留在主代理中，false 则完全不显示这些节点
  const SHOW_INFO_NODES_IN_MAIN = true;
  
  // 是否在主代理中保留 "DIRECT" (直连) 选项
  // true 则保留，false 则去除
  const SHOW_DIRECT_IN_MAIN = false;

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

  // =================================================


  const proxies = config.proxies || [];
  
  // 用于提取信息类节点（如剩余流量、套餐到期）
  const infoNodes = [];
  const normalProxies = [];

  proxies.forEach(proxy => {
    // 匹配常见的流量/过期时间等提示性节点
    if (/剩余流量|套餐到期|到期时间|过期时间|有效时间|Traffic|Expire/i.test(proxy.name)) {
      infoNodes.push(proxy.name);
    } else {
      normalProxies.push(proxy);
    }
  });
  
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

    // 1.1 仅清理 CN 标记，保留其他已有旗帜（避免误删稀有节点旗帜）
    const cleanedName = originalName
      .replace(cnFlagRegex, "")                 // 移除 🇨🇳
      .replace(/CN|China/g, "")        // 移除文本 CN/China
      .replace(/中国大陆|中国/g, "")               // 移除中文 CN 标识
      .replace(/\s+/g, " ")
      .trim();

    if (matchedMapping) {
      // 1.2 重命名：如果已是目标旗帜开头则不重复添加
      if (!cleanedName.startsWith(matchedMapping.flag)) {
        proxy.name = cleanedName ? `${matchedMapping.flag} ${cleanedName}` : matchedMapping.flag;
      } else {
        proxy.name = cleanedName;
      }
      proxy.name = normalizeFlagSpacing(proxy.name);
      
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
      proxy.name = cleanedName || originalName.trim();
      proxy.name = normalizeFlagSpacing(proxy.name);
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
  const proxyByName = new Map(config.proxies.map(p => [p.name, p]));
  config.proxies = [...allProxyNames, ...infoNodes]
    .map(name => proxyByName.get(name))
    .filter(Boolean);

  // 2. 构建新的代理组
  const newProxyGroups = [];

  // 主代理组：直接使用排序后的 config.proxies
  const mainProxyGroup = {
    name: "主代理",
    type: "select",
    proxies: [
      ...countryGroupNames,
      ...(SHOW_DIRECT_IN_MAIN ? ["DIRECT"] : []),
      ...config.proxies
        .filter(p => SHOW_INFO_NODES_IN_MAIN || !infoNodes.includes(p.name))
        .map(p => p.name)
    ]
  };
  newProxyGroups.push(mainProxyGroup);

  // 应用分类策略组
  const appGroupNames = [
    "Google", "Microsoft", "PayPal", "OpenAI", "Twitter", "Youtube", "Netflix", "Disney", "Hbomax",
    "Apple", "Spotify", "Steam", "Telegram", "Discord", "TikTok",
    "GoogleFCM", "Speedtest", "Bilibili","Bahamut", "China", "GFWList", "Final"
  ];

  appGroupNames.forEach(appName => {
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
  
  // 将生成的国家组放入总代理组中
  newProxyGroups.push(...countryProxyGroups);

  // 3. 构建新的 Rule-Providers
  const ruleProviders = {
    "Apple-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Apple/Apple-IP.mrs",
      path: "./ruleset/Apple-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Apple-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Apple/Apple-Site.mrs",
      path: "./ruleset/Apple-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Bahamut-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Bahamut/Bahamut-Site.mrs",
      path: "./ruleset/Bahamut-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Bilibili-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Bilibili/Bilibili-IP.mrs",
      path: "./ruleset/Bilibili-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Bilibili-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Bilibili/Bilibili-Site.mrs",
      path: "./ruleset/Bilibili-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "China-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/China/China-IP.mrs",
      path: "./ruleset/China-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "China-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/China/China-Site.mrs",
      path: "./ruleset/China-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Discord-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Discord/Discord-Site.mrs",
      path: "./ruleset/Discord-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Disney-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/disney.mrs",
      path: "./ruleset/Disney-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "GFWList-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/GFWList/GFWList-Site.mrs",
      path: "./ruleset/GFWList-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Google-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Google/Google-IP.mrs",
      path: "./ruleset/Google-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Google-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Google/Google-Site.mrs",
      path: "./ruleset/Google-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "GoogleFCM-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/GoogleFCM/GoogleFCM-Site.mrs",
      path: "./ruleset/GoogleFCM-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Hbomax-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/hbo.mrs",
      path: "./ruleset/Hbomax-Site.mrs",
    proxy: "DIRECT",
    interval: 604800
    },
    "Local-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Local/Local-IP.mrs",
      path: "./ruleset/Local-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Microsoft-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Microsoft/Microsoft-Site.mrs",
      path: "./ruleset/Microsoft-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Netflix-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Netflix/Netflix-Site.mrs",
      path: "./ruleset/Netflix-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Netflix-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Netflix/Netflix-IP.mrs",
      path: "./ruleset/Netflix-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "OpenAI-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/OpenAI/OpenAI-IP.mrs",
      path: "./ruleset/OpenAI-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "OpenAI-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/OpenAI/OpenAI-Site.mrs",
      path: "./ruleset/OpenAI-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "PayPal-Site":{
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/paypal.mrs",
      path: "./ruleset/PayPal-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Speedtest-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Speedtest/Speedtest-Site.mrs",
      path: "./ruleset/Speedtest-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Spotify-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Spotify/Spotify-IP.mrs",
      path: "./ruleset/Spotify-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Spotify-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Spotify/Spotify-Site.mrs",
      path: "./ruleset/Spotify-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Steam-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Steam/Steam-Site.mrs",
      path: "./ruleset/Steam-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Telegram-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Telegram/Telegram-IP.mrs",
      path: "./ruleset/Telegram-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Telegram-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/Telegram/Telegram-Site.mrs",
      path: "./ruleset/Telegram-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "TikTok-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/HosheaPDNX/rule-set@V2.0.6/mihomo/TikTok/TikTok-Site.mrs",
      path: "./ruleset/TikTok-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Twitter-IP": {
      type: "http",
      behavior: "ipcidr",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/twitter.mrs",
      path: "./ruleset/Twitter-IP.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Twitter-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/twitter.mrs",
      path: "./ruleset/Twitter-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
    "Youtube-Site": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      url: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/youtube.mrs",
      path: "./ruleset/Youtube-Site.mrs",
      proxy: "DIRECT",
      interval: 604800
    },
  };

  // 4. 构建新的 Rules
  const rules = [
    // "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT",
    "DOMAIN,ntp.aliyun.com,DIRECT",
    "DOMAIN-KEYWORD,msftconnecttest.com,主代理",
    "DOMAIN-KEYWORD,msftncsi.com,主代理",
    "DOMAIN-KEYWORD,googleapis,Google",
    "RULE-SET,Bahamut-Site,Bahamut",
    "RULE-SET,Bilibili-Site,Bilibili",
    "RULE-SET,PayPal-Site,PayPal",
    "RULE-SET,Discord-Site,Discord",
    "RULE-SET,GoogleFCM-Site,GoogleFCM",
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
    "MATCH,主代理"
  ];
  
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
      "any:53"
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

  // 6. 将构建好的对象重新赋给 config
  config["proxy-groups"] = newProxyGroups;
  config["rule-providers"] = ruleProviders;
  config.rules = rules;

  return config;
}
