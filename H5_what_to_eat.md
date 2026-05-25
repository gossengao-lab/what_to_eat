```markdown
# H5_what_to_eat.md

> “今天吃什么灵感助手” H5 单页应用 — 产品定义、技术架构、数据模型与设计指南  
> 面向：前端开发人员、产品经理  
> 版本：v1.0  
> 原型目标：在纯原生技术栈下，快速验证核心体验闭环

---

## 1. 产品定义

### 1.1 页面功能（5 项核心交互）

1. **全自动情境感知与智能解读**  
   - 自动获取地理位置、当前时间、实时天气，组合成一句人性化的问候文案。  
   - 支持“确认，开始推荐”或“换一换情境”手动微调时间/天气心情。

2. **智能偏好设置**  
   - 两级美食分类（一级大类 + 二级具体菜系），支持多选。  
   - 热门偏好模板一键应用，忌口管理（常用标签 + 自定义添加），可暂时跳过。

3. **灵魂推荐引擎与展示**  
   - 综合用户偏好、忌口、情境数据与随机性，生成一道具体菜品。  
   - 全屏结果卡片：大字号菜品名、结合情境的推荐理由、附近可配送商家预估数。  
   - 底部固定“就它了！”与“跳过(不喜欢)”按钮。

4. **决策与无缝跳转**  
   - 醒目展示菜品名，提供“复制名称”功能。  
   - 一键深度跳转至美团/饿了么 App 搜索结果页（URL Scheme + Deep Link）。  
   - 未安装 App 时降级为打开应用商店，剪贴板保留菜品名。

5. **智能跳过与即时学习**  
   - 点击“跳过”后浮层快速选择原因（不想吃该品类 / 暂时不想吃外卖等）。  
   - 本次会话内即时屏蔽相应品类，提升后续推荐命中率。

### 1.2 用户旅程

1. **首次访问** → 极简引导页（可选，P2 可按需实现）：展示产品价值主张，引导设置偏好。  
2. **情境感知页**  
   - 请求地理位置授权。  
   - 自动展示情境文案（例如：“晚上好！你在北京·海淀区，现在是周五19:30，下着小雨🌧️。推荐来点暖和的治愈一下吧？”）。  
   - 用户可点击“确认，开始推荐”进入推荐流，或点击“换一换情境”微调午餐/晚餐、雨天/晴天心情。  
3. **推荐结果页**  
   - 全屏展示推荐菜品卡片（菜名、推荐语、商家数量）。  
   - 用户可选择：  
     - 点击“就它了！” → 进入行动页。  
     - 点击“跳过” → 浮层选择原因 → 即时调整，重新推荐新菜品。  
4. **行动页**  
   - 展示菜品名 + “复制名称”按钮（点击后 Toast 提示“复制成功”）。  
   - “去美团外卖搜索”/“去饿了么搜索”按钮，触发 App 跳转。  
   - 若未安装 App，引导下载并保持菜品名在剪贴板。  
5. **循环使用**：返回后可从主界面再次“给我今日灵感”，重复推荐流程。

### 1.3 成功指标（原型验证）

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 推荐转化率 | ≥ 30% | “就它了！”点击次数 / 推荐展示次数 |
| 跳转成功率 | ≥ 60% | 成功唤起至少一个外卖 App 的占比 |
| 偏好设置完成率 | ≥ 50% | 完成一级分类选择的用户占比 |
| 连续跳过次数 | ≤ 2 次/会话 | 中位数连续跳过不超过 2 次即获得满意结果 |
| 情境交互参与度 | ≥ 40% | 使用“换一换情境”的用户占比（若上线该功能） |
| 次日回访率 (可选埋点) | ≥ 15% | 通过 LocalStorage 记录上次使用日期估算 |

> 原型阶段侧重验证“情境感知→推荐→跳转”的核心路径是否顺畅，用户是否愿意点击跳转。

---

## 2. 技术架构

### 2.1 技术栈

- **纯原生**：HTML5 + CSS3 + ES6+ JavaScript，无任何第三方框架或库。
- **网络请求**：使用 `fetch` API 获取天气数据（需接入天气 API，如 OpenWeatherMap、和风天气等）。
- **地理位置**：使用浏览器 Geolocation API（`navigator.geolocation`）。
- **剪贴板操作**：使用 `navigator.clipboard.writeText` 降级兼容 `document.execCommand('copy')`。
- **URL Scheme 跳转**：直接通过 `window.location.href` 唤起 App，未安装时超时降级跳转应用商店。
- **模块化**：ES6 Modules（若需拆分文件，但原型保持单文件 `app.js` 即可，内部用 IIFE 或模块模式隔离作用域）。

### 2.2 数据存储：LocalStorage 使用策略

- **存储原则**  
  - 所有持久化数据均以 JSON 字符串存储。  
  - 键名统一前缀 `wte_`（what to eat 缩写），避免冲突。  
  - 读写使用 `try-catch` 包裹，防止无痕模式或配额溢出导致异常。

- **键名设计**  

| 键名 | 存储内容 | 数据结构 |
|------|----------|----------|
| `wte_user_profile` | 用户偏好、忌口、昵称 | 对象，见数据模型 |
| `wte_recommend_history` | 最近 20 条推荐记录 | 数组，每个元素包含时间戳、菜品名、是否采纳、跳过原因 |
| `wte_session_state` | 当前会话临时状态（已跳过的品类列表、连续拒绝次数等） | 对象，页面关闭时清空或使用 sessionStorage 代替 |
| `wte_onboarding_completed` | 引导是否已完成 | 布尔值 |
| `wte_last_feedback_prompt` | 上次弹出反馈的时间戳 | 毫秒数，用于控制反馈频次 |

> 说明：`wte_session_state` 更适合使用 `sessionStorage`，保证浏览器会话结束自动清除。原型中对于“本次会话”的控制可用 `sessionStorage`，持久化用户偏好用 `localStorage`。

### 2.3 文件结构

```
prototype/
├── index.html          # 主入口，包含所有页面状态的 HTML 骨架
├── styles.css          # 全局样式、组件样式、响应式规则
├── app.js              # 核心逻辑：状态管理、情境感知、推荐算法、视图切换
├── data/
│   └── foodDB.js       # 模拟菜品库、品类结构、推荐理由模板（导出为 ES Module 或全局对象）
└── README.md           # 项目说明与运行指导
```

> 实际原型中可将 `foodDB.js` 直接内联或作为全局变量，但保留独立文件使结构清晰。

---

## 3. 数据模型

### 3.1 核心类定义（ES6+ Class）

```javascript
// ---------- 用户偏好模型 ----------
class UserProfile {
  constructor() {
    this.nickname = '';               // 用户昵称（可选）
    this.selectedCategories = {       // 一级分类 -> 二级分类数组
      '中式简餐': ['川湘菜', '粤菜'],
      '日韩料理': ['寿司']
    };
    this.dietaryRestrictions = [];    // 忌口标签列表，如 ['不要香菜', '少油少盐']
    this.favoriteTemplates = [];      // 曾使用的热门模板名称
  }

  // 添加忌口
  addRestriction(tag) {
    if (!this.dietaryRestrictions.includes(tag)) {
      this.dietaryRestrictions.push(tag);
    }
  }

  // 判断某菜品是否与忌口冲突（需配合菜品标签）
  hasConflict(dishTags = []) {
    return dishTags.some(tag => this.dietaryRestrictions.includes(tag));
  }

  // 序列化为普通对象存储
  toJSON() {
    return {
      nickname: this.nickname,
      selectedCategories: this.selectedCategories,
      dietaryRestrictions: this.dietaryRestrictions,
      favoriteTemplates: this.favoriteTemplates
    };
  }

  // 从对象恢复实例
  static fromJSON(json) {
    const profile = new UserProfile();
    Object.assign(profile, json);
    return profile;
  }
}

// ---------- 情境上下文模型 ----------
class RecommendationContext {
  constructor({ time, weather, location, manualOverride = {} }) {
    this.timestamp = time || new Date();           // Date 对象
    this.mealPeriod = this.inferMealPeriod();      // 'breakfast', 'lunch', 'dinner'
    this.dayOfWeek = this.timestamp.getDay();      // 0-6 (星期日-六)
    this.weather = weather || {                    // 天气数据
      condition: 'unknown',   // e.g., 'rain', 'sunny', 'cloudy'
      temperature: 20
    };
    this.location = location || {                  // 地理位置
      district: '未知区域',
      city: '未知城市'
    };
    // 允许手动覆盖情境标签（如“雨天想吃暖的”）
    this.manualTags = manualOverride.tags || [];
  }

  inferMealPeriod() {
    const hour = this.timestamp.getHours();
    if (hour >= 6 && hour < 10) return 'breakfast';
    if (hour >= 10 && hour < 14) return 'lunch';
    if (hour >= 14 && hour < 17) return 'afternoon_tea'; // 可合并到午餐后段
    if (hour >= 17 && hour < 21) return 'dinner';
    return 'night_snack';
  }

  // 生成情境描述文案（示例）
  generateNarrative(nickname) {
    const periodText = { breakfast: '早上好', lunch: '中午好', dinner: '晚上好' };
    const greeting = periodText[this.mealPeriod] || '你好';
    const nameStr = nickname ? `，${nickname}` : '';
    const locStr = `${this.location.city}·${this.location.district}`;
    const timeStr = `周${['日','一','二','三','四','五','六'][this.dayOfWeek]} ${this.timestamp.getHours()}:${String(this.timestamp.getMinutes()).padStart(2,'0')}`;
    let weatherDesc = '';
    if (this.weather.condition === 'rain') weatherDesc = '窗外正下着小雨🌧️';
    else if (this.weather.condition === 'sunny') weatherDesc = '阳光正好☀️';
    else weatherDesc = '天气不错';
    return `${greeting}${nameStr}！你在${locStr}，现在是${timeStr}，${weatherDesc}。推荐来点……`;
  }
}

// ---------- 推荐结果模型 ----------
class RecommendationResult {
  constructor({ dishName, reason, estimatedShops, sourceCategory }) {
    this.dishName = dishName;           // 菜品名称
    this.reason = reason;               // 推荐理由文案
    this.estimatedShops = estimatedShops; // 附近可配送商家预估数量（整数）
    this.sourceCategory = sourceCategory; // 所属二级分类，用于屏蔽逻辑
    this.imageUrl = '';                 // 预留图片字段，原型可不使用
  }
}

// ---------- 推荐历史记录项模型 ----------
class HistoryItem {
  constructor(result, action, skipReason = '') {
    this.timestamp = Date.now();
    this.dishName = result.dishName;
    this.action = action;       // 'accepted' | 'skipped'
    this.skipReason = skipReason;
  }
}

// ---------- 推荐引擎（纯函数集合，可实例化为服务） ----------
class RecommendationEngine {
  constructor(foodDatabase) {
    this.foodDB = foodDatabase;   // 菜品库（从 foodDB.js 注入）
  }

  // 核心推荐方法：根据用户画像、上下文、历史返回一个结果
  recommend(profile, context, sessionSkippedCategories = []) {
    // 1. 根据偏好类别筛选可用菜品池
    // 2. 排除忌口冲突菜品
    // 3. 根据时间、天气、星期几加权
    // 4. 排除本次会话已跳过的品类
    // 5. 保证随机性与多样性（避免与最近历史重复）
    // 6. 生成推荐理由（可组合模板）
    // 返回 RecommendationResult 实例
    // （具体实现逻辑在 app.js 中完成，此处略）
  }
}
```

### 3.2 LocalStorage 数据结构映射

- **`wte_user_profile`** 存储 `UserProfile` 实例的 `toJSON()` 结果。
- **`wte_recommend_history`** 存储 `HistoryItem` 实例数组，最多保留 20 条。
- **`wte_session_state`**（或使用 `sessionStorage`）存储：
  ```json
  {
    "skippedCategories": ["川湘菜"],   // 本次会话已跳过的二级分类
    "consecutiveSkips": 1,
    "lastRecommendedDish": "黄焖鸡米饭"
  }
  ```
- 读取时用 `UserProfile.fromJSON(JSON.parse(localStorage.getItem('wte_user_profile')))` 还原。

---


## 4. 设计系统 (Design System)

本系统采用移动端优先、全原生技术栈对齐的 Tokens 规范，确保无框架依赖下的极速渲染与高保真还原。

### 4.1 颜色变量 (Color Tokens)

```css
:root {
  /* 品牌核心色系 */
  --Color-primary: #FF6B35;        /* 激发食欲的暖橙色，用于核心行动与强强调 */
  --Color-primaryLight: #FFF0E8;   /* 浅橙色，用于标签选中背景与轻度强调 */
  --Color-secondary: #2EC4B6;      /* 薄荷绿，用于辅助状态、跳转链接与次要按钮 */
  
  /* 中性色系（文字与背景） */
  --Color-background: #F7F7F7;     /* 页面整体大背景色，柔和防疲劳 */
  --Color-cardBackground: #FFFFFF; /* 卡片、弹窗、独立白底区域 */
  --Color-textPrimary: #1A1A1A;    /* 大标题、核心文本、强对比高明度墨黑 */
  --Color-textSecondary: #6B6B6B;  /* 辅助说明、次要信息、未选中状态的中灰 */
  --Color-divider: #EEEEEE;        /* 分割线、极细边框线 */
  
  /* 功能状态色 */
  --Color-error: #E53935;          /* 错误提示、忌口冲突强警示红 */
  --Color-mask: rgba(0, 0, 0, 0.4);/* 弹窗蒙层半透明黑色 */
  
  /* 三方平台专用色（禁止魔改） */
  --Color-platform-meituan: #FFD100; /* 美团黄 */
  --Color-platform-eleme: #0097FF;   /* 饿了么蓝 */
}

```

### 4.2 字体样式 (Typography Tokens)

#### 4.2.1 基础字体栈 (Font Family)

优先调用系统原生无衬线字体，确保在 iOS 与 Android 端均能实现完美的几何渲染。

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif;

```

#### 4.2.2 文本样式类 (Text Styles)

| 样式名称 (Token) | 字号 (Font Size) | 字重 (Font Weight) | 行高 (Line Height) | 适用场景 |
| --- | --- | --- | --- | --- |
| `Font.headingLarge` | 28px | 700 (Bold) | 1.3 | 核心推荐菜品名 |
| `Font.headingMedium` | 20px | 600 (Semi-Bold) | 1.4 | 首页情境智能解读文案、浮层大标题 |
| `Font.bodyRegular` | 16px | 400 (Regular) | 1.5 | 推荐理由正文、核心按钮文字 |
| `Font.buttonSmall` | 15px | 500 (Medium) | 1.4 | 次要按钮、普通文本按钮 |
| `Font.caption` | 13px | 400 (Regular) | 1.2 | 辅助提示、卡片分类标签、商家数量提示 |

---

### 4.3 可复用组件规范 (Component Specifications)

#### 4.3.1 核心按钮组 (Buttons)

* **主要行动按钮 `PrimaryButton**`
用于“确认，开始推荐”、“就它了！”等最高优先级交互。
```css
.btn-primary {
  height: 48px;
  min-width: 160px;
  padding: 12px 28px;
  background-color: var(--Color-primary);
  color: var(--Color-cardBackground);
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 24px;
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
  transition: all 0.2s ease;
  cursor: pointer;
}
.btn-primary:active {
  transform: scale(0.97);
  opacity: 0.9;
}
.btn-primary:disabled {
  background-color: #CCCCCC;
  box-shadow: none;
  cursor: not-allowed;
}

```



```

*   **次要行动按钮 `SecondaryButton`**  
    用于“复制名称”等边框型操作，或通过修改背景色演变为外卖平台专色跳转钮。
    ```css
    .btn-secondary {
      height: 48px;
      padding: 12px 24px;
      background-color: var(--Color-cardBackground);
      color: var(--Color-primary);
      border: 1px solid var(--Color-primary);
      border-radius: 24px;
      font-size: 16px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .btn-secondary:active {
      background-color: var(--Color-primaryLight);
    }
    /* 变体：美团跳转按钮 */
    .btn-platform--meituan {
      background-color: var(--Color-platform-meituan);
      color: #1A1A1A;
      border: none;
      border-radius: 12px;
    }
    /* 变体：饿了么跳转按钮 */
    .btn-platform--eleme {
      background-color: var(--Color-platform-eleme);
      color: #FFFFFF;
      border: none;
      border-radius: 12px;
    }

```

* **轻量文本按钮 `TextButton**`
用于“跳过”、“换一换情境”等弱化操作，不干扰视觉主线。
```css
.btn-text {
  background: transparent;
  border: none;
  color: var(--Color-textSecondary);
  font-size: 15px;
  padding: 8px 16px;
  cursor: pointer;
}
.btn-text--accent {
  color: var(--Color-secondary); /* 针对换一换等需要有色强调的文本按钮 */
}

```



```

#### 4.3.2 容器卡片 `BaseCard`
承载情境与结果展示的核心载体。
```css
.card {
  background-color: var(--Color-cardBackground);
  border-radius: 16px;
  padding: 24px 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
  box-sizing: border-box;
}
/* 变体：带品牌高亮边条的情境感知卡片 */
.card--highlight {
  border-left: 4px solid var(--Color-primary);
}

```

#### 4.3.3 标签芯片 `TagChip`

用于偏好选择（二级联动）及忌口管理的行内微组件。

```css
/* 默认未选中态 */
.tag-chip {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 6px 14px;
  background-color: var(--Color-cardBackground);
  border: 1px solid var(--Color-divider);
  border-radius: 20px;
  color: var(--Color-textSecondary);
  font-size: 13px;
  white-space: nowrap;
  transition: all 0.2s ease;
}
/* 选中激活态 */
.tag-chip--active {
  background-color: var(--Color-primaryLight);
  border-color: var(--Color-primary);
  color: var(--Color-primary);
}
/* 忌口独有标签（带移除按钮） */
.tag-chip--dietary {
  background-color: #F2F2F2;
  border: none;
  color: var(--Color-textPrimary);
}
.tag-chip--dietary .close-icon {
  margin-left: 6px;
  font-size: 14px;
  color: var(--Color-textSecondary);
}

```

#### 4.3.4 轻量反馈组件 `Toast & Modal`

```css
/* 全局单例 Toast 提示框 */
.toast {
  position: fixed;
  bottom: 12%;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.75);
  color: #FFFFFF;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  pointer-events: none;
  text-align: center;
}

/* 智能跳过原因单选浮层 */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--Color-mask);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal-content {
  background-color: var(--Color-cardBackground);
  border-radius: 16px;
  width: 85%;
  max-width: 400px;
  padding: 24px;
}

```

---

## 附录：原始产品需求文档 (PRD)

### 产品需求文档 (PRD)：今天吃什么灵感助手 (H5版)

#### 需求背景及目标
1. **需求背景**：  
   当前，都市上班族普遍面临“用餐选择困难症”，主流外卖平台的推荐算法基于历史行为，易形成信息茧房，加剧决策疲劳。用户需要一个中立、智能且情境化的决策工具，打破常规推荐逻辑，快速激发食欲并完成消费决策。

2. **需求目标**：  
   基于上述背景，本方案旨在打造一个轻量级H5产品，通过“极简偏好设置 + 全自动情境感知 + 灵魂算法推荐”的核心路径，在30秒内为用户提供一个高度个性化、有说服力的美食灵感，并通过“一键深度跳转”无缝对接外卖平台，实现从决策到转化的完整闭环，解决用户“不知道吃什么”的核心痛点。

#### 需求描述

**1. 模块功能1：全自动情境感知与智能解读 (P0)**
* **需求详述**：此功能为H5首页的核心交互。用户授权后，系统应自动完成三项数据获取与整合呈现：
    * **自动获取**：通过浏览器接口自动获取用户地理位置（需授权）、当前系统时间、实时天气信息（基于地理位置调用天气API）。
    * **智能解读**：将上述数据整合成一句人性化的、带有引导性的描述文案，展示在首页核心区域。例如：“{{用户昵称}}，晚上好！你在{{北京·海淀区}}，现在是周五19:30，窗外正下着小雨🌧️。推荐来点暖和的治愈一下吧？”
    * **用户操作**：用户可点击“确认，开始推荐”直接进入推荐流，或点击“换一换情境”手动微调时间（午/晚餐）、天气心情（如“雨天想吃暖的”、“晴天想吃爽口的”）。
* **优先级**：P0。此乃核心体验破局点，旨在零成本理解用户状态，建立“工具很懂我”的第一印象。

**2. 模块功能2：智能偏好设置 (P1)**
* **需求详述**：此功能为新用户引导流程及老用户偏好管理入口。
    * **两级分类**：完全参照主流平台，设计两级美食分类标签。一级分类（如“中式简餐”、“日韩料理”），二级分类为具体菜系或品类（如“川湘菜”、“寿司”）。支持多选。
    * **极简流程**：
        1. 新用户首次使用或在“我的”页面，可进入“美食偏好”设置。
        2. 界面提供“热门推荐”偏好组合（如“打工人经典套餐：中式简餐+快食西餐”），支持一键应用。
        3. 用户可快速勾选1-3个一级分类，系统随即展开对应的二级标签供细化选择。
    * **忌口管理**：提供常用忌口模板（如“不要香菜”、“少油少盐”、“不吃猪肉”），支持自定义添加。支持“暂无，跳过”按钮。
* **优先级**：P1。在保证推荐精准度的前提下，最大程度降低用户前置操作成本，防止流失。

**3. 模块功能3：灵魂推荐引擎与展示 (P0)**
* **需求详述**：此为产品最核心的算法与展示模块。
    * **推荐触发**：在情境解读页点击“确认”后，或主界面点击“给我今日灵感”按钮，触发推荐。
    * **算法逻辑**：推荐算法需综合以下维度生成一个具体菜品名称及其理由：
        1. 用户数据：预设的偏好、忌口。
        2. 情境数据：时间（早/中/晚餐）、天气、星期几（如周五晚可加权“庆祝型”食物）。
        3. 随机性与多样性：避免连续推荐同一大品类。
    * **结果卡片**：全屏展示推荐结果，包含：
        1. 核心推荐：大字号展示菜品名（如“酸汤肥牛锅”）。
        2. 推荐理由：一句结合情境的推荐语（如：“微凉的雨夜，一口酸汤瞬间唤醒疲惫的味蕾，暖暖的很贴心。”）。
        3. 关联信息：预估附近可提供此菜品的外卖商家数量，如“约 15 家店可送”。
        4. 操作按钮：底部固定“就它了！”和“跳过 (不喜欢)”按钮。
* **优先级**：P0。此功能直接决定产品价值，是用户获得惊喜感的核心。

**4. 模块功能4：智能跳过与学习 (P1)**
* **需求详述**：此功能与推荐引擎紧密交互，用于优化后续推荐。
    * **跳过交互**：用户点击“跳过”按钮后，弹出轻量级浮层，提供2-3个预设跳过原因（如“今天不想吃这个品类”、“不想吃外卖了，下次再说”），用户可快速选择或直接关闭浮层。
    * **算法学习**：系统需记录“跳过”动作及原因（如有），并立即调整本次会话的后续推荐策略。例如，选择“不想吃这个品类”，则本次会话中应屏蔽该品类推荐。
* **优先级**：P1。即时反馈机制能有效减少用户连续失望的挫败感，提升推荐命中率。

**5. 模块功能5：决策与无缝跳转 (P0)**
* **需求详述**：此功能承接推荐，完成从决策到行动的关键转化。
    * **核心行动**：用户点击“就它了！”后，进入行动页。
    * **功能一：复制名称**：醒目展示菜品名称，并提供“复制名称”按钮，点击后给予“复制成功”的Toast提示。
    * **功能二：深度链接跳转**：在“复制名称”按钮旁/下方，提供“去美团外卖搜索”、“去饿了么搜索”按钮。点击后：
        1. 调用手机中已安装的对应App的URL Scheme，直接打开该App。
        2. 通过预置的Deep Link，将已复制的菜品名称作为搜索关键词，直接跳转至该App内的搜索结果页，实现“一键搜索”。
    * **降级方案**：如检测到对应App未安装，则点击按钮后打开应用商店下载页，并保持剪贴板内容（菜品名）不变。
* **优先级**：P0。这是核心转化节点，一键跳转能极大降低用户决策后的行动成本，完成体验闭环。

**6. 模块功能6：用户引导与分享 (P2)**
* **需求详述**：此模块用于拉新、促活与反馈收集。
    * **首次引导 (P2)**：新用户首次访问时，在情境感知页之前，展示1-2页极简的产品价值引导图（如“告别吃什么难题”、“30秒找到灵感”），并引导进行快速偏好设置。
    * **轻量反馈 (P3)**：用户在使用“深度链接跳转”后再次返回本H5，或在每日首次访问时，可概率性弹出极简反馈弹窗，用1-5个表情（从😞到😄）询问“上次推荐你觉得怎么样？”，并提示“反馈会让推荐更准哦”。
    * **社交分享 (P4)**：在推荐结果页和“我的”页面，提供“分享灵感”按钮。点击后生成包含今日推荐菜品、情境化文案和产品二维码的分享海报，支持保存至手机或直接分享至社交平台。
* **优先级**：P2（引导）、P3（反馈）、P4（分享）。在核心流程跑通后，用于优化拉新与留存。
```