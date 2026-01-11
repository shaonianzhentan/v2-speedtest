
const yaml = require("js-yaml");
const axios = require("axios"); // 确保安装了 axios: npm i axios
const testNodeConnectivity = require('./speedtest');
const output = require("./output");

// ================= 配置区域 =================
const START_PORT = 12000; // 并发测试起始端口
const CONCURRENCY = 10;    // 提高并发数，因为合并后节点较多
// 订阅链接列表
const SUBSCRIPTION_URLS = [
    "https://gh-proxy.com/raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/yudou66.yaml",
    "https://gh-proxy.com/raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/ndnode.yaml",
    "https://gh-proxy.com/raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/nodev2ray.yaml",
    "https://gh-proxy.com/raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/nodefree.yaml"
];
// ===========================================

/**
 * 获取并合并所有订阅源的节点
 */
async function fetchAndMergeProxies(urls) {
    let allProxies = [];
    const nameSet = new Set();

    console.log(`🚀 正在下载 ${urls.length} 个订阅源...`);

    const requests = urls.map(url => 
        axios.get(url, { timeout: 15000 })
            .then(res => yaml.load(res.data))
            .catch(err => {
                console.error(`❌ 下载失败 [${url}]: ${err.message}`);
                return null;
            })
    );

    const configs = await Promise.all(requests);

    configs.forEach((config, index) => {
        if (config && config.proxies && Array.isArray(config.proxies)) {
            config.proxies.forEach(proxy => {
                // 解决同名节点冲突：如果名字重复，添加后缀
                let uniqueName = proxy.name;
                let counter = 1;
                while (nameSet.has(uniqueName)) {
                    uniqueName = `${proxy.name}_${counter++}`;
                }
                proxy.name = uniqueName;
                nameSet.add(uniqueName);
                allProxies.push(proxy);
            });
            console.log(`✅ 源 [${index + 1}] 解析成功: ${config.proxies.length} 个节点`);
        }
    });

    return allProxies;
}

/**
 * 主执行逻辑
 */
async function run() {
    // 1. 获取所有节点
    const allNodes = await fetchAndMergeProxies(SUBSCRIPTION_URLS);

    if (allNodes.length === 0) {
        console.error("❌ 未找到任何有效节点，请检查订阅链接。");
        return;
    }

    console.log(`\n合并完成，共计 ${allNodes.length} 个节点。开始并发验证 YouTube 连通性 (并发数: ${CONCURRENCY})...\n`);

    // 2. 并发测试
    const results = [];
    let currentIndex = 0;

    async function worker(workerId) {
        while (currentIndex < allNodes.length) {
            const i = currentIndex++;
            const node = allNodes[i];
            const port = START_PORT + workerId;

            // 调用你封装的 speedtest.js
            const res = await testNodeConnectivity(node, port);
            results.push(res);

            const status = res.success ? `✅ ${res.delay}ms` : "❌ 失败/超时";
            console.log(`[${currentIndex}/${allNodes.length}] ${node.name.padEnd(30)} ${status}`);
        }
    }

    // 启动并行 Worker
    const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
    await Promise.all(workers);

    // 3. 过滤并排序（按延迟从低到高）
    const filtered = results.filter(n => n.success).sort((a, b) => a.delay - b.delay);

    if (filtered.length === 0) {
        console.error("\n无法生成文件：没有一个节点通过 YouTube 测速。");
        return;
    }

    // 4. 调用你外部的 output 函数
    const OUTPUT_FILE = output(filtered);

    console.log(`\n-----------------------------------`);
    console.log(`YouTube 验证结束！`);
    console.log(`可用节点: ${filtered.length} / ${allNodes.length}`);
    console.log(`结果已保存至: ${OUTPUT_FILE}`);
    console.log(`-----------------------------------`);
}

run().catch(err => console.error("运行出错:", err));