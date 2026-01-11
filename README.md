# v2ray-speedtest
自动过滤连接超时的节点

### 安装v2ray

https://github.com/v2fly/v2ray-core/releases

```bash
wget https://github.com/v2fly/v2ray-core/releases/download/v5.42.0/v2ray-linux-64.zip

unzip -o v2ray-linux-64.zip -d v2ray

chmod +x v2ray/v2ray
```

### 过滤不可用

安装依赖
```bash
npm install
```

执行检测
```bash
node index.js
```

注意：请自行修改代码内订阅URL