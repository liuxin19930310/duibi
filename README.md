# duibi — 网络设备配置对比工具

面向运营商 / 企业网络的**设备配置解析与割接前后对比**工具。将华为、华三等设备的 `display` 导出文本归一化解析，生成结构化表格，并支持双设备 / 割接前后的差异高亮。

## 能力

- **配置解析**：解析接口总表、BGP / OSPF / ISIS / LDP / SRv6 / LLDP / ARP / IPv6 邻居 / 路由统计等协议表
- **差异对比**：逐行对比割接前后或双设备，自动标记新增 / 删除 / 变更字段并高亮
- **后台解析**：解析在 Web Worker 子线程执行，避免阻塞 UI
- **导出**：表格可导出为带样式的 Excel

## 技术栈

- Vue 3 + Element Plus（表格渲染）
- Pinia（状态管理）+ vue-router
- Vite（构建）
- Web Worker（解析管线）
- xlsx-js-style（Excel 导出）

## 本地开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 构建到 dist/
```

## 目录结构

```
src/                  前端源码
  components/         ProtoPanel、InterfaceInfoModule 等表格组件
  views/              DevicePage 等页面
  utils/              compareCore（解析核心）、deviceParser（接口解析）
  styles/             全局与表格样式
scripts/              辅助脚本
server/               本地服务端（llm-config.json 含密钥，不入库）
tests/                测试
```

## 协议解析来源

解析输入为设备多个 `display` 命令输出的纯文本拼接（华为 / 华三），由 `compareCore.parseDeviceProtocolsPure(text, vendor, subtype)` 产出纯 JSON 表格。

## 仓库说明

- `node_modules/`、`dist/`、`preview/`、`backup/`、日志文件、`.env`、服务端密钥均经 `.gitignore` 忽略，不入库
- 提交身份使用 GitHub 隐私邮箱

## 快捷提交

已配置本仓库别名 `acp`（add + commit + push 合一），日常提交只需一条命令：

```bash
git acp "一句话说明改动"
```
