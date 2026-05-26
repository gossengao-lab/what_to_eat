# 今天吃什么 · 灵感助手

轻量级 H5 单页应用，帮助你在 30 秒内摆脱「吃什么」的决策焦虑。通过**全自动情境感知**、**智能偏好设置**与**灵魂推荐引擎**，生成一道具体菜品，并一键跳转美团 / 淘宝闪购完成下单搜索。

> 在线体验：[https://gossengao-lab.github.io/what_to_eat/](https://gossengao-lab.github.io/what_to_eat/)

---

## 核心功能

| 模块 | 说明 |
|------|------|
| **情境感知** | 自动获取地理位置、当前时间与实时天气，生成人性化问候文案；支持「换一换情境」微调餐段与天气心情 |
| **偏好设置** | 两级美食分类多选、热门模板一键应用、忌口标签（预设 + 自定义） |
| **智能推荐** | 综合偏好、忌口、情境与随机性，输出菜品名、推荐理由及附近可配送商家预估数 |
| **跳过学习** | 选择跳过原因后，本次会话内即时屏蔽对应品类，提升后续命中率 |
| **无缝跳转** | 复制菜名、通过 URL Scheme / Deep Link 唤起美团或淘宝闪购搜索；未安装 App 时降级至应用商店 |

### 用户旅程

1. **情境页** — 授权定位后展示情境文案，点击「确认，开始推荐」
2. **推荐页** — 全屏结果卡片，选择「就它了！」或「跳过」
3. **行动页** — 复制名称、跳转外卖 App 搜索
4. **循环** — 返回首页可再次获取今日灵感

更完整的产品定义、数据模型与设计规范见 [`H5_what_to_eat.md`](./H5_what_to_eat.md)。

---

## 技术栈

- **纯原生**：HTML5 + CSS3 + ES6+ JavaScript（无 React / Vue 等框架）
- **模块化**：ES Modules 拆分业务逻辑
- **定位**：浏览器 Geolocation API + OpenStreetMap 逆地理编码
- **天气**：Open-Meteo 免费 API
- **存储**：`localStorage` / `sessionStorage`（键名统一前缀 `wte_`）
- **剪贴板**：`navigator.clipboard`（降级 `document.execCommand`）
- **部署**：GitHub Actions → GitHub Pages

### 性能优化

- 进入页面后**后台预加载**位置与天气，首屏可立即点击推荐
- 菜品库与偏好元数据**懒加载**，减小首包体积
- 情境数据**本地缓存**（定位 TTL 5 分钟），减少重复请求

---

## 项目结构

```
what_to_eat/
├── index.html              # 主入口（多视图单页骨架）
├── styles.css              # 全局样式与设计 Token
├── app.js                  # 主控制器：视图切换、事件绑定、流程编排
├── js/
│   ├── constants.js        # UI 常量（忌口预设、跳过原因等）
│   ├── models.js           # UserProfile、RecommendationContext 等数据模型
│   ├── context-engine.js   # 定位 / 天气 / 情境文案与预加载
│   ├── recommendation.js   # 推荐引擎与菜品库访问
│   ├── food-db.js          # 菜品库、分类结构、理由模板
│   ├── storage.js          # LocalStorage 读写封装
│   └── utils.js            # 剪贴板、Deep Link 等工具
├── text.html               # 测试 / 演示用例页（可选）
├── H5_what_to_eat.md       # 产品与技术设计文档
├── DEPLOY.md               # GitHub Pages 部署说明
└── .github/workflows/
    └── deploy-pages.yml    # 自动部署工作流（含 HTML 校验）
```

---

## 本地运行

无需构建步骤，任意静态服务器即可：

```bash
# 方式一：Python
python3 -m http.server 8080

# 方式二：Node（需已安装 npx）
npx serve .
```

浏览器访问 `http://localhost:8080`（或对应端口）。  
**说明**：定位与天气 API 需在 HTTPS 或 `localhost` 环境下才能正常工作。

### HTML 校验（可选）

```bash
npx html-validate@9.4.0 index.html
```

规则配置见 [`.htmlvalidate.json`](./.htmlvalidate.json)。

---

## 部署到 GitHub Pages

向 `main` 分支推送后，`.github/workflows/deploy-pages.yml` 会自动：

1. 使用 html-validate 校验 `index.html`
2. 将静态资源部署到 GitHub Pages

详细步骤与故障排查见 [`DEPLOY.md`](./DEPLOY.md)。

| 仓库类型 | 访问地址 |
|----------|----------|
| 项目站点（本仓库） | `https://<组织或用户名>.github.io/what_to_eat/` |

---

## 数据存储

| 键名 | 用途 |
|------|------|
| `wte_user_profile` | 用户偏好、忌口、昵称 |
| `wte_recommend_history` | 最近 20 条推荐记录 |
| `wte_session_state` | 当前会话跳过品类、连续跳过次数等 |
| `wte_onboarding_completed` | 是否完成引导 |
| `wte_location_cache` | 定位缓存（情境引擎内部使用） |

---

## 相关文档

- [`H5_what_to_eat.md`](./H5_what_to_eat.md) — 产品定义、技术架构、数据模型、设计系统
- [`DEPLOY.md`](./DEPLOY.md) — GitHub Pages 部署与排错

---

## License

本项目为原型验证用途，欢迎学习与参考。如需商用或二次发布，请自行评估第三方 API 与外卖平台跳转相关合规要求。
