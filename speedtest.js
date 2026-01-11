const fs = require("fs");
const { spawn } = require("child_process");
const axios = require("axios");
const { SocksProxyAgent } = require("socks-proxy-agent");
const path = require("path");

const V2RAY_EXE = path.resolve(__dirname, "v2ray", "v2ray"); 
const TEST_URL = "https://www.youtube.com/generate_204"; // YouTube 专用测试接口

/**
 * 转换 Clash 节点为 V2Ray 配置
 */
function createV2rayConfig(node, port) {
    const outbound = {
        "protocol": node.type,
        "settings": {},
        "streamSettings": {
            "network": node.network || "tcp",
            "security": node.tls ? "tls" : (node['reality-opts'] ? "reality" : "none")
        }
    };

    if (node.type === "vless") {
        outbound.settings = {
            "vnext": [{
                "address": node.server,
                "port": node.port,
                "users": [{ "id": node.uuid || node.id, "encryption": "none", "flow": node.flow || "" }]
            }]
        };
    } else if (node.type === "trojan") {
        outbound.settings = {
            "servers": [{ "address": node.server, "port": node.port, "password": node.password }]
        };
    }

    // 传输层适配
    if (node.network === "ws") {
        outbound.streamSettings.wsSettings = {
            "path": node['ws-opts']?.path || "/",
            "headers": node['ws-opts']?.headers || {}
        };
    } else if (node.network === "grpc") {
        outbound.streamSettings.grpcSettings = {
            "serviceName": node['grpc-opts']?.['grpc-service-name'] || ""
        };
    }

    // 安全层适配
    if (outbound.streamSettings.security === "reality") {
        outbound.streamSettings.realitySettings = {
            "publicKey": node['reality-opts']['public-key'],
            "shortId": node['reality-opts']['short-id'],
            "serverName": node.servername || node.server,
            "fingerprint": node['client-fingerprint'] || "chrome"
        };
    } else if (outbound.streamSettings.security === "tls") {
        outbound.streamSettings.tlsSettings = {
            "serverName": node.servername || node.sni || node.server,
            "allowInsecure": true
        };
    }

    return {
        "log": { "loglevel": "none" },
        "inbounds": [{ "port": port, "listen": "127.0.0.1", "protocol": "socks" }],
        "outbounds": [outbound]
    };
}

/**
 * YouTube 连通性测试
 */
module.exports = function testNodeConnectivity(node, port) {
    return new Promise(async (resolve) => {
        const tmpConfigPath = path.join(__dirname, `tmp_cfg_${port}.json`);
        fs.writeFileSync(tmpConfigPath, JSON.stringify(createV2rayConfig(node, port)));

        const v2ray = spawn(V2RAY_EXE, ["run", "-c", tmpConfigPath]);
        
        // 给内核启动留一点缓冲
        await new Promise(r => setTimeout(r, 2000));

        // 强制使用 socks5h 以确保 DNS 在远端解析，防止污染
        const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${port}`, { 
            rejectUnauthorized: false 
        });
        
        const start = Date.now();
        let success = false;
        let delay = -1;

        try {
            await axios.get(TEST_URL, {
                httpAgent: agent,
                httpsAgent: agent,
                timeout: 8000, // 增加到 8 秒，因为访问 YouTube 的 TLS 握手较重
                proxy: false,
                validateStatus: (s) => s < 500
            });
            delay = Date.now() - start;
            success = true;
        } catch (e) {
            success = false;
        } finally {
            v2ray.kill("SIGKILL");
            if (fs.existsSync(tmpConfigPath)) fs.unlinkSync(tmpConfigPath);
            resolve({ ...node, success, delay });
        }
    });
}
