# CloudBridge 保险演示

企业数字服务中断保险前端，覆盖传统云服务与 AI API。中文界面，五个模块：承保、核保、理赔、核赔、定价模型。包含 M2 地缘政治外溢三层风险地图及参数赔付参考报价。

## 部署内容

- `dist/` 是完整静态网站，无需安装依赖或执行构建。
- 无服务器端接口；保单、赔案、报价、监测和支付均为演示。
- 恢复服务商城已移除。
- 所有页面脚本、样式和地图均随项目提供，不依赖外部 CDN。
- 业务状态保存在浏览器 localStorage；域名、浏览器或设备改变时不会自动迁移。地图中新参考模型与原保单报价独立。

## 本地演示

需要 Python 3：

```sh
python3 local_server.py start
```

打开 http://127.0.0.1:8787/ 。M2 地图入口为 http://127.0.0.1:8787/#m2 。

```sh
python3 local_server.py status
python3 local_server.py stop
```

本地启动器仅监听回环地址；它不是服务器公网托管服务。

## 服务器部署

使用 Nginx 或其他静态网站服务，将网站根目录指向本仓库的 `dist/`。

推荐目录：`/var/www/cloudbridge/dist`。

1. 在服务器安装 Git 和 Nginx。
2. 从本仓库克隆代码到 `/var/www/cloudbridge`。私有仓库使用只读部署密钥或已授权账号，勿将访问令牌写入仓库或命令行。
3. 参考 `deploy/nginx.conf` 配置独立站点。按照服务器现有站点安排端口、域名和目录，避免覆盖其他网站。
4. 检查配置成功后重新加载 Nginx，并在服务器网络规则中允许网站使用的端口。
5. 绑定域名并配置 HTTPS。现场演示前使用韩国网络测试页面、刷新和交互。

`deploy/nginx.conf` 是 HTTP 配置示例，域名与 HTTPS 证书需按服务器环境配置；未在目标服务器运行验证。

根页面 `index.html` 位于 `dist/`，不要将仓库根目录或 `.git/` 作为公网文件目录。此项目无需公开本地演示用的 8787 端口。

## 检查

需要 Node.js：

```sh
node --check dist/app.js
node --check dist/m2-map.js
node --check dist/m2-risk.js
node tests/engine.test.cjs
node tests/m2-risk.test.cjs
```

## 目录

- `dist/app.js`：页面与演示状态流转。
- `dist/engine.js`：原定价与核赔规则。
- `dist/data.js`：样例数据及公开事件链接。
- `dist/m2-risk.js`、`dist/m2-map.js`、`dist/m2-map.css`：M2参考模型与地图。
- `tests/`：保险核心规则和 M2 计算检查。
- `PROJECT_NOTES.md`：项目功能、数据口径和历史开发记录。

## 数据与资源

各地区概率、恢复情景和价格为演示假设；不表示实时风险、真实报价或承保承诺。底图使用 Natural Earth 公共领域物理海岸线；区域点位是代表位置，不是实际设施地址。https://www.naturalearthdata.com/about/terms-of-use/
