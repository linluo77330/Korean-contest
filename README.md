# CloudBridge

跨境数字服务中断保险前端演示。当前版本：**CB-CONFLICT-3.0**，更新日期：**2026-11-19**。

这是无需编译的静态网站，网站根目录为 **`dist/`**。没有 npm 安装或打包步骤，Nginx 可直接提供整个 `dist/` 目录；事件目录、地图、翻译及报告必须一并部署。

## 当前内容

- 承保、核保、理赔、核赔、定价模型五个模块；项目支持新建及归档。
- 中文、英文、韩文、日文切换，覆盖页面与导出报告。
- M1 公开故障目录、厂商/产品/年份/区域筛选及承保服务关联分析。
- M2 多年危险性地图、逐年趋势、逐格事件目录及云服务风险暴露视图；支持拖动和手势缩放。
- 统一 USD 定价：100 张差异化示例保单、逐事件超赔、净损失封顶及四层成本展示。
- 理赔入口默认打开事故报告；核定和结案无需财务授权声明或人工复核勾选步骤。
- M2 按冲突损坏数字依赖并传导至列明服务中断的责任范围演示。

## 本地运行

需要 Python 3：

```sh
python3 local_server.py start
```

打开 http://127.0.0.1:8787/ 。停止服务使用 `python3 local_server.py stop`。

## Ubuntu 与 Nginx 部署

首次克隆：

```sh
git clone https://github.com/linluo77330/Korean-contest.git ~/cloudbridge-demo
```

已克隆过的服务器，在仓库内更新：

```sh
cd ~/cloudbridge-demo
git pull --ff-only origin main
```

Nginx 的实际 `root` 必须指向这份代码的 `dist/`，或指向复制了整个 `dist/` 内容的发布目录。`deploy/nginx.conf` 提供配置示例；按服务器已有域名、目录和虚拟主机配置调整，避免与原网站冲突。如果当前网站使用单独的发布目录，还需把更新后的 `dist/` 同步到该目录。仅 `git pull` 不会自动更新另一份发布目录。

修改 Nginx 配置后执行：

```sh
sudo nginx -t && sudo systemctl reload nginx
```

更新静态文件本身无需重启 PM2。浏览器刷新即可读取最新资源；遇到缓存使用强制刷新。源代码上传 GitHub 与云服务器更新是两个独立步骤。

## 数据与业务状态

- 静态地图与公开事件数据随站点发布，详细出处见 [数据来源](dist/DATA-SOURCES.md)。该文件部分后续章节记录历史模型，当前责任与定价以 [当前说明](docs/CONFLICT_SCOPE_3.md) 和 `dist/pricing.js` 为准。
- 页面中的报价、监测回放、赔案和支付流程用于演示，不接入真实支付或实时客户云账户。
- 企业填写内容和业务记录保存在访问者浏览器；仓库不包含本地浏览器中的客户档案。归档也由浏览器保存。
- `PROJECT_NOTES.md` 和部分 `docs/` 文档保留历史版本说明。

## 验证

需要 Node.js；这些检查不依赖 npm 包：

```sh
node --test tests/engine.test.cjs tests/external-events.test.cjs tests/hazard-history.test.cjs tests/m1-catalog.test.cjs tests/unified.test.cjs
```

当前四语言和核赔浏览器验收入口：`tests/i18n-claims-browser.test.cjs`。需提供 `PLAYWRIGHT_MODULE`、`CHROME_PATH` 并启动本地服务。它使用独立会话，覆盖四语言页面、响应式布局、HTML 导出、事故报告优先以及 M1/M2 核定结案。其余浏览器测试含历史流程断言。
