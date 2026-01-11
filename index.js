const yaml = require("js-yaml");
const axios = require("axios");
const testNodeConnectivity = require('./speedtest');
const output = require("./output");

// ================= 配置区域 =================
const START_PORT = 12000; 
const CONCURRENCY = 15;    
const TEST_ROUNDS = 3;     
const SUBSCRIPTION_URLS = [
    "https://gh-proxy.com/raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/yudou66.yaml",
    "https://gh-proxy.com/raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/ndnode.yaml",
    "https://gh-proxy.com/raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/nodev2ray.yaml"
];
// ===========================================

async function fetchAndMergeProxies(urls) {
    let allProxies = [];
    const nameSet = new Set();
    console.log(`🚀 正在下载并解析订阅源...`);

    const requests = urls.map(url => 
        axios.get(url, { timeout: 15000 }).then(res => yaml.load(res.data)).catch(e => null)
    );

    const configs = await Promise.all(requests);
    configs.forEach(config => {
        if (config?.proxies) {
            config.proxies.forEach(proxy => {
                let uniqueName = proxy.name;
                let counter = 1;
                while (nameSet.has(uniqueName)) { uniqueName = `${proxy.name}_${counter++}`; }
                proxy.name = uniqueName;
                nameSet.add(uniqueName);
                allProxies.push(proxy);
            });
        }
    });
    return allProxies;
}

async function run() {
    const allNodes = await fetchAndMergeProxies(SUBSCRIPTION_URLS);
    if (allNodes.length === 0) return;

    const nodeStats = new Map();
    allNodes.forEach(node => {
        // 增加 totalSpeed 用于统计
        nodeStats.set(node.name, { totalDelay: 0, totalSpeed: 0, successCount: 0, proxy: node });
    });

    console.log(`\n🕵️ 开始稳定性与速度压测（仅保留 ${TEST_ROUNDS}/${TEST_ROUNDS} 全通节点）...`);

    for (let round = 1; round <= TEST_ROUNDS; round++) {
        let finishedInRound = 0; 
        let currentIndex = 0;   

        console.log(`\n━━━━━━━━━━━━ 第 ${round} / ${TEST_ROUNDS} 轮测试 ━━━━━━━━━━━━`);

        async function worker(workerId) {
            while (currentIndex < allNodes.length) {
                const i = currentIndex++;
                const node = allNodes[i];
                const port = START_PORT + workerId;
                
                try {
                    const res = await testNodeConnectivity(node, port);
                    const stats = nodeStats.get(node.name);
                    if (res.success) {
                        stats.successCount += 1;
                        stats.totalDelay += res.delay;
                        stats.totalSpeed += (res.speed || 0); // 累加速度
                    }
                } catch (e) {}

                finishedInRound++;
                const percent = ((finishedInRound / allNodes.length) * 100).toFixed(1);
                process.stdout.write(`\r[进度] 第 ${round} 轮: ${percent}% (${finishedInRound}/${allNodes.length}) | 正在扫描: ${node.name}          `);
            }
        }

        const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
        await Promise.all(workers);
        process.stdout.write(`\n✅ 第 ${round} 轮测试完毕\n`);
    }

    // 3. 严格筛选与数据平均化
    const finalResults = [];
    nodeStats.forEach((stats) => {
        if (stats.successCount === TEST_ROUNDS) {
            finalResults.push({
                ...stats.proxy,
                success: true,
                delay: Math.round(stats.totalDelay / TEST_ROUNDS),
                speed: parseFloat((stats.totalSpeed / TEST_ROUNDS).toFixed(2)) // 计算平均速度
            });
        }
    });

    // 4. 排序：速度优先（降序），延迟次之（升序）
    const sorted = finalResults.sort((a, b) => {
        if (b.speed !== a.speed) {
            return b.speed - a.speed; // 速度大的排前面
        }
        return a.delay - b.delay; // 速度一样则延迟小的排前面
    });

    if (sorted.length === 0) {
        console.error(`\n❌ 筛选失败：在 ${TEST_ROUNDS} 轮测试中没有 100% 稳定的节点。`);
        return;
    }

    // 5. 输出文件
    const OUTPUT_FILE = output(sorted);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎊 测试完成！已按【速度优先】排序`);
    console.log(`原始节点总数: ${allNodes.length}`);
    console.log(`100% 稳定节点: ${sorted.length}`);
    console.log(`----------------------------------`);
    console.log(`Top 5 最快稳节点:`);
    sorted.slice(0, 5).forEach((n, idx) => {
        console.log(`${idx + 1}. ${n.name.padEnd(25)} | 速度: ${n.speed} MB/s | 延迟: ${n.delay}ms`);
    });
    console.log(`----------------------------------`);
    console.log(`结果文件路径: ${OUTPUT_FILE}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

run().catch(err => console.error("运行出错:", err));
