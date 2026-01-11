const fs = require("fs");
const yaml = require("js-yaml");

module.exports = (filtered) => {
    const YAML_FILE = "template.yaml";
    const OUTPUT_FILE = "clash-config.yaml";
    // 读取 YAML
    let configData;
    try {
        configData = yaml.load(fs.readFileSync(YAML_FILE, "utf8"));
    } catch (err) {
        console.error("读取 YAML 失败:", err.message);
        process.exit(1);
    }

    if(!Array.isArray(configData.proxies)) configData.proxies = []

    // 更新 YAML 数据
    Array.prototype.push.apply(configData.proxies, filtered.map(({ success, delay, ...rest }) => rest));

    // 更新或创建策略组
    let anonGroup = (configData['proxy-groups'] || []).find(g => g.name === '♻️ 自动选择');

    if (anonGroup) {
        anonGroup.proxies = filtered.map(n => n.name);
    }

    anonGroup = (configData['proxy-groups'] || []).find(g => g.name === '☑️ 手动切换');

    if (anonGroup) {
        anonGroup.proxies = filtered.map(n => n.name);
    }

    // 导出新文件
    const newYaml = yaml.dump(configData, { lineWidth: -1, noRefs: true });
    fs.writeFileSync(OUTPUT_FILE, newYaml, "utf8");
    return OUTPUT_FILE
}