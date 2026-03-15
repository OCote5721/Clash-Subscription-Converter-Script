function main(config) {
  // 预定义的国家正则匹配和对应的旗帜
  const countryMapping = [
    { regex: /^(HK|HongKong|香港)/i, flag: "🇭🇰", name: "HK" },
    { regex: /^(JP|Japan|日本|东京|大阪)/i, flag: "🇯🇵", name: "JP" },
    { regex: /^(KR|Korea|韩国|首尔)/i, flag: "🇰🇷", name: "KR" },
    { regex: /^(SG|Singapore|新加坡|狮城)/i, flag: "🇸🇬", name: "SG" },
    { regex: /^(TW|Taiwan|台湾|新北|彰化)/i, flag: "🇹🇼", name: "TW" },
    { regex: /^(US|America|美国|洛杉矶|硅谷|西雅图)/i, flag: "🇺🇸", name: "US" },
    { regex: /^(UK|UK|英国|伦敦)/i, flag: "🇬🇧", name: "UK" },
    { regex: /^(DE|Germany|德国|法兰克福)/i, flag: "🇩🇪", name: "DE" },
    { regex: /^(FR|France|法国|巴黎)/i, flag: "🇫🇷", name: "FR" },
    { regex: /^(AU|Australia|澳大利亚|悉尼)/i, flag: "🇦🇺", name: "AU" },
    { regex: /^(RU|Russia|俄罗斯|莫斯科)/i, flag: "🇷🇺", name: "RU" },
    { regex: /^(IN|India|印度|孟买)/i, flag: "🇮🇳", name: "IN" },
    { regex: /^(CA|Canada|加拿大)/i, flag: "🇨🇦", name: "CA" },
    { regex: /^(MY|Malaysia|马来西亚)/i, flag: "🇲🇾", name: "MY" }
  ];

  // 定义排序优先级
  const sortOrder = ["HK", "JP", "KR", "SG", "TW", "US"];
  
  const proxies = config.proxies || [];
  
  // 用于存储检测到的国家节点
  const countryNodes = {};
  
  // 记录每个节点所属的国家，用于后续零散节点排序
  const nodeCountryMap = {};

  // 1. 为节点添加旗帜，并收集国家分类
  proxies.forEach(proxy => {
    let matched = false;
    for (const mapping of countryMapping) {
      if (mapping.regex.test(proxy.name)) {
        // 去除原本可能有的重复前缀旗帜，只保留新的旗帜
        if (!proxy.name.startsWith(mapping.flag)) {
            proxy.name = `${mapping.flag} ${proxy.name}`;
        }
        
        const groupName = mapping.name; // 不带旗帜的组名
        if (!countryNodes[groupName]) {
          countryNodes[groupName] = [];
        }
        countryNodes[groupName].push(proxy.name);
        nodeCountryMap[proxy.name] = mapping.name;
        matched = true;
        break; // 匹配到一个国家就跳出
      }
    }
    if (!matched) {
      nodeCountryMap[proxy.name] = "others";
    }
  });

  // 获取所有存在节点的国家组名，并按照指定顺序排序
  let countryGroupNames = Object.keys(countryNodes);
  countryGroupNames.sort((a, b) => {
    const indexA = sortOrder.indexOf(a);
    const indexB = sortOrder.indexOf(b);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB; // 都在优先级列表中，按列表顺序
    } else if (indexA !== -1) {
      return -1; // a 在列表中，a 排前面
    } else if (indexB !== -1) {
      return 1; // b 在列表中，b 排前面
    } else {
      return a.localeCompare(b); // 都不在列表中，按字母顺序
    }
  });

  // 生成排好序的国家节点组
  const countryProxyGroups = [];
  countryGroupNames.forEach(groupName => {
    countryProxyGroups.push({
      name: groupName,
      type: "url-test",
      url: "https://cp.cloudflare.com",
      interval: 180,
      lazy: false,
      proxies: countryNodes[groupName]
    });
  });

  // 对所有节点名称进行排序
  const allProxyNames = proxies.map(p => p.name).sort((nameA, nameB) => {
    const countryA = nodeCountryMap[nameA];
    const countryB = nodeCountryMap[nameB];
    
    if (countryA === countryB) {
      return nameA.localeCompare(nameB); // 同一个国家内按名称排序
    }
    
    if (countryA === "others") return 1;  // others 永远排在最后
    if (countryB === "others") return -1;
    
    const indexA = sortOrder.indexOf(countryA);
    const indexB = sortOrder.indexOf(countryB);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    } else if (indexA !== -1) {
      return -1;
    } else if (indexB !== -1) {
      return 1;
    } else {
      return countryA.localeCompare(countryB);
    }
  });

  // 2. 构建新的代理组
  const newProxyGroups = [];

  // 主代理组 (去除图标)
  const mainProxyGroup = {
    name: "主代理",
    type: "select",
    proxies: [...countryGroupNames, "DIRECT", ...allProxyNames]
  };
  newProxyGroups.push(mainProxyGroup);

  // 应用分类策略组 (无图标)
  const appGroupNames = [
    "中国大陆网站", "黑名单网站", "Google", "Apple", "Microsoft", "Bahamut", 
    "Bilibili", "Discord", "GoogleFCM", "Netflix", "OpenAI", "Speedtest", 
    "Spotify", "Steam", "Telegram", "TikTok"
  ];

  // 这里的策略组只有 主代理、DIRECT 和国家节点组
  appGroupNames.forEach(appName => {
    const proxiesForApp = ["主代理", "DIRECT", ...countryGroupNames];
    
    // 特定组的细微调整
    let appProxies = [...proxiesForApp];
    if (appName === "中国大陆网站" || appName === "Bilibili") {
        appProxies = ["DIRECT", "主代理", ...countryGroupNames];
    }

    newProxyGroups.push({
      name: appName,
      type: "select",
      proxies: appProxies
    });
  });
  
  // 将生成的国家组也放入总代理组中
  newProxyGroups.push(...countryProxyGroups);

  // 3. 构建新的 Rule-Providers
  const ruleProviders = {
    "Apple-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Apple/Apple-Site.mrs", path: "./ruleset/Apple-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Apple-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/Apple/Apple-IP.mrs", path: "./ruleset/Apple-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "Bahamut-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Bahamut/Bahamut-Site.mrs", path: "./ruleset/Bahamut-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Bilibili-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Bilibili/Bilibili-Site.mrs", path: "./ruleset/Bilibili-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Bilibili-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/Bilibili/Bilibili-IP.mrs", path: "./ruleset/Bilibili-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "China-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/China/China-Site.mrs", path: "./ruleset/China-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "China-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/China/China-IP.mrs", path: "./ruleset/China-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "Discord-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Discord/Discord-Site.mrs", path: "./ruleset/Discord-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "GFWList-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/GFWList/GFWList-Site.mrs", path: "./ruleset/GFWList-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Google-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Google/Google-Site.mrs", path: "./ruleset/Google-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Google-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/Google/Google-IP.mrs", path: "./ruleset/Google-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "GoogleFCM-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/GoogleFCM/GoogleFCM-Site.mrs", path: "./ruleset/GoogleFCM-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Local-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/Local/Local-IP.mrs", path: "./ruleset/Local-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "Microsoft-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Microsoft/Microsoft-Site.mrs", path: "./ruleset/Microsoft-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Netflix-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Netflix/Netflix-Site.mrs", path: "./ruleset/Netflix-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Netflix-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/Netflix/Netflix-IP.mrs", path: "./ruleset/Netflix-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "OpenAI-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/OpenAI/OpenAI-Site.mrs", path: "./ruleset/OpenAI-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "OpenAI-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/OpenAI/OpenAI-IP.mrs", path: "./ruleset/OpenAI-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "Speedtest-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Speedtest/Speedtest-Site.mrs", path: "./ruleset/Speedtest-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Spotify-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Spotify/Spotify-Site.mrs", path: "./ruleset/Spotify-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Spotify-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/Spotify/Spotify-IP.mrs", path: "./ruleset/Spotify-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "Steam-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Steam/Steam-Site.mrs", path: "./ruleset/Steam-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Telegram-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/Telegram/Telegram-Site.mrs", path: "./ruleset/Telegram-Site.mrs", proxy: "DIRECT", interval: 86400 },
    "Telegram-IP": { type: "http", behavior: "ipcidr", format: "mrs", url: "mihomo/Telegram/Telegram-IP.mrs", path: "./ruleset/Telegram-IP.mrs", proxy: "DIRECT", interval: 86400 },
    "TikTok-Site": { type: "http", behavior: "domain", format: "mrs", url: "mihomo/TikTok/TikTok-Site.mrs", path: "./ruleset/TikTok-Site.mrs", proxy: "DIRECT", interval: 86400 }
  };

  // 4. 构建新的 Rules
  const rules = [
    "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT",
    "DOMAIN,ntp.aliyun.com,DIRECT",
    "DOMAIN-KEYWORD,msftconnecttest.com,主代理",
    "DOMAIN-KEYWORD,msftncsi.com,主代理",
    "DOMAIN-KEYWORD,googleapis,Google",
    "RULE-SET,Bahamut-Site,Bahamut",
    "RULE-SET,Bilibili-Site,Bilibili",
    "RULE-SET,Discord-Site,Discord",
    "RULE-SET,GoogleFCM-Site,GoogleFCM",
    "RULE-SET,Netflix-Site,Netflix",
    "RULE-SET,OpenAI-Site,OpenAI",
    "RULE-SET,Speedtest-Site,Speedtest",
    "RULE-SET,Spotify-Site,Spotify",
    "RULE-SET,Steam-Site,Steam",
    "RULE-SET,Telegram-Site,Telegram",
    "RULE-SET,TikTok-Site,TikTok",
    "RULE-SET,Apple-Site,Apple",
    "RULE-SET,Google-Site,Google",
    "RULE-SET,Microsoft-Site,Microsoft",
    "RULE-SET,GFWList-Site,黑名单网站",
    "RULE-SET,China-Site,中国大陆网站",
    "RULE-SET,Local-IP,DIRECT,no-resolve",
    "RULE-SET,Bilibili-IP,Bilibili",
    "RULE-SET,Netflix-IP,Netflix",
    "RULE-SET,OpenAI-IP,OpenAI",
    "RULE-SET,Spotify-IP,Spotify",
    "RULE-SET,Telegram-IP,Telegram",
    "RULE-SET,Apple-IP,Apple",
    "RULE-SET,Google-IP,Google",
    "RULE-SET,China-IP,中国大陆网站",
    "MATCH,主代理"
  ];
  
  // 5. 更新 DNS 设置
  if (config.dns) {
    if (config.dns.nameserver) {
       config.dns.nameserver = config.dns.nameserver.map(ns => ns.replace("#🌏️主代理", "#主代理"));
    }
    if (config.dns["nameserver-policy"]) {
       config.dns["nameserver-policy"] = {
        "ntp.aliyun.com": "https://dns.alidns.com/dns-query#DIRECT",
        "+.msftconnecttest.com,+.msftncsi.com": "https://cloudflare-dns.com/dns-query#主代理",
        "+.googleapis.com,+.googleapis.cn": "https://cloudflare-dns.com/dns-query#Google",
        "rule-set:Bahamut-Site": "https://cloudflare-dns.com/dns-query#Bahamut",
        "rule-set:Bilibili-Site": "https://dns.alidns.com/dns-query#Bilibili",
        "rule-set:Discord-Site": "https://cloudflare-dns.com/dns-query#Discord",
        "rule-set:GoogleFCM-Site": "https://cloudflare-dns.com/dns-query#GoogleFCM",
        "rule-set:Netflix-Site": "https://cloudflare-dns.com/dns-query#Netflix",
        "rule-set:OpenAI-Site": "https://cloudflare-dns.com/dns-query#OpenAI",
        "rule-set:Speedtest-Site": "https://cloudflare-dns.com/dns-query#Speedtest",
        "rule-set:Spotify-Site": "https://cloudflare-dns.com/dns-query#Spotify",
        "rule-set:Steam-Site": "https://doh.pub/dns-query#Steam",
        "rule-set:Telegram-Site": "https://cloudflare-dns.com/dns-query#Telegram",
        "rule-set:TikTok-Site": "https://cloudflare-dns.com/dns-query#TikTok",
        "rule-set:Apple-Site": "https://doh.pub/dns-query#Apple",
        "rule-set:Google-Site": "https://cloudflare-dns.com/dns-query#Google",
        "rule-set:Microsoft-Site": "https://doh.pub/dns-query#Microsoft",
        "rule-set:GFWList-Site": "https://cloudflare-dns.com/dns-query#黑名单网站",
        "rule-set:China-Site": "https://dns.alidns.com/dns-query#中国大陆网站"
       };
    }
  }

  // 6. 将构建好的对象重新赋给 config
  config.proxies = proxies;
  config["proxy-groups"] = newProxyGroups;
  config["rule-providers"] = ruleProviders;
  config.rules = rules;

  return config;
}
