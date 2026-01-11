const fs = require("fs");
const { spawn } = require("child_process");
const axios = require("axios");
const { SocksProxyAgent } = require("socks-proxy-agent");
const path = require("path");

const V2RAY_EXE = path.resolve(__dirname, "v2ray", "v2ray"); 
const TEST_URL = "https://www.youtube.com/generate_204"; 
// 测速地址：建议选择一个全球CDN加速的地址
const SPEED_TEST_URL = "https://cachefly.cachefly.net/10mb.test"; 

function createV2rayConfig(node, port) {
    // ... 原有配置逻辑保持不变 ...
    const outbound = {
        "protocol": node.type,
        "settings": {},
        "streamSettings": {
            "network": node.network || "tcp",
            "security": node.tls ? "tls" : (node['reality-opts'] ? "reality" : "none")
        }
    };
    if (node.type === "vless") {
        outbound.settings = { "vnext": [{ "address": node.server, "port": node.port, "users": [{ "id": node.uuid || node.id, "encryption": "none", "flow": node.flow || "" }] }] };
    } else if (node.type === "trojan") {
        outbound.settings = { "servers": [{ "address": node.server, "port": node.port, "password": node.password }] };
    }
    if (node.network === "ws") { outbound.streamSettings.wsSettings = { "path": node['ws-opts']?.path || "/", "headers": node['ws-opts']?.headers || {} }; }
    else if (node.network === "grpc") { outbound.streamSettings.grpcSettings = { "serviceName": node['grpc-opts']?.['grpc-service-name'] || "" }; }
    if (outbound.streamSettings.security === "reality") {
        outbound.streamSettings.realitySettings = { "publicKey": node['reality-opts']['public-key'], "shortId": node['reality-opts']['short-id'], "serverName": node.servername || node.server, "fingerprint": node['client-fingerprint'] || "chrome" };
    } else if (outbound.streamSettings.security === "tls") {
        outbound.streamSettings.tlsSettings = { "serverName": node.servername || node.sni || node.server, "allowInsecure": true };
    }
    return { "log": { "loglevel": "none" }, "inbounds": [{ "port": port, "listen": "127.0.0.1", "protocol": "socks" }], "outbounds": [outbound] };
}

/**
 * 测速逻辑函数
 */
async function measureSpeed(agent) {
    const start = Date.now();
    let downloadedBytes = 0;
    try {
        const response = await axios({
            method: 'get',
            url: SPEED_TEST_URL,
            httpAgent: agent,
            httpsAgent: agent,
            responseType: 'stream',
            timeout: 10000 // 测速限时 10 秒
        });

        return new Promise((resolve) => {
            response.data.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                // 如果下载超过 5MB，提前结束测速，节省流量和时间
                if (downloadedBytes > 5 * 1024 * 1024) {
                    response.data.destroy();
                }
            });

            response.data.on('close', () => {
                const duration = (Date.now() - start) / 1000; // 秒
                const speedMBps = (downloadedBytes / 1024 / 1024 / duration).toFixed(2);
                resolve(parseFloat(speedMBps));
            });

            response.data.on('error', () => resolve(0));
        });
    } catch (e) {
        return 0;
    }
}

module.exports = function testNodeConnectivity(node, port) {
    return new Promise(async (resolve) => {
        const tmpConfigPath = path.join(__dirname, `tmp_cfg_${port}.json`);
        fs.writeFileSync(tmpConfigPath, JSON.stringify(createV2rayConfig(node, port)));

        const v2ray = spawn(V2RAY_EXE, ["run", "-c", tmpConfigPath]);
        await new Promise(r => setTimeout(r, 2000));

        const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${port}`, { rejectUnauthorized: false });
        
        const start = Date.now();
        let success = false;
        let delay = -1;
        let speed = 0;

        try {
            // 1. 延迟测试
            await axios.get(TEST_URL, {
                httpAgent: agent,
                httpsAgent: agent,
                timeout: 5000,
                proxy: false
            });
            delay = Date.now() - start;
            success = true;

            // 2. 只有延迟测试成功的节点才进行下载测速
            if (success) {
                speed = await measureSpeed(agent);
            }
        } catch (e) {
            success = false;
        } finally {
            v2ray.kill("SIGKILL");
            if (fs.existsSync(tmpConfigPath)) fs.unlinkSync(tmpConfigPath);
            // 返回结果包含延迟和速度
            resolve({ ...node, success, delay, speed });
        }
    });
}
