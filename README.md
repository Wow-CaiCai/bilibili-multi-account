# Bilibili Multi-Account

按主账号、记录观看、推荐、视频取流分别选择 B 站账号的油猴脚本，支持二维码、密码、短信登录以及 Cookie 导入。

## 开发与安装

需要 Node.js 22.13+ 或 24+、npm，以及浏览器中的 Tampermonkey。

```sh
npm ci
npm run build
```

构建产物为 `dist/bilibili-multi-account.user.js`，可将其全部内容粘贴到 Tampermonkey 的新建脚本编辑器后保存。更新已有脚本时，用构建产物替换原脚本内容。不要直接安装 `src/main.js` 或 `userscript.meta.js`。

当前命名空间为 `bilibili.local.multi-account`，存储键为 `bilibili-web-accounts-v1`。从旧版升级前，请先导出账号备份；更新后导入备份以恢复账号配置。

```sh
npm run dev       # 监听源码、样式、元数据，重新生成安装文件
npm run lint      # 静态检查
npm test          # 播放器、完整构建产物和第三方登录库测试
npm run check    # 静态检查、构建、测试
npm run format   # 格式化自有源码，保留第三方代码原貌
npm run build:readme # 单独生成用于脚本站的 README
```

监听模式只更新本地文件；每次调试仍需将新产物更新到 Tampermonkey 并刷新目标网页。这里不注入开发服务器或热更新客户端，以保留 `document-start` 的同步启动时序。

## README 图片与脚本站简介

图片放在 `docs/images/` 中。日常只编辑根目录的 `README.md`，用相对路径引用图片，本地 Markdown 预览会直接显示尚未上传的图片。例如，将截图保存为 `docs/images/panel.png` 后添加：

```markdown
![账号管理界面](docs/images/panel.png)
```

运行 `npm run build` 会生成两份产物：脚本和 `dist/README.md`。后者是面向脚本猫、Greasy Fork 等脚本站的文档副本，会把图片相对路径改成公开的 GitHub HTTPS 图片地址，同时转换普通的相对文档链接。支持 Markdown 图片、引用式图片和 HTML `<img src="...">`；代码示例中的路径保持原样。不要手动编辑生成的文档。

图片文件必须与 README 一起提交到公开的 GitHub 仓库。构建会检查本地图片文件是否存在，并拒绝电脑绝对路径和超出仓库的图片路径。GitHub Actions 使用当前提交的图片地址，使每次发布的截图与文档对应；本地生成时默认使用 `main` 分支，可通过 `README_REF` 指定其他分支、标签或提交。

每次 Actions 检查完成后，可以在 Artifacts 中下载发布版 README；推送版本标签时，Release 的附件中也会包含 `README.md`。在脚本站粘贴这份文档，或在平台支持外部简介同步时使用已发布文档的下载地址：

```text
https://github.com/Wow-CaiCai/bilibili-multi-account/releases/latest/download/README.md
```

该地址在首次成功发布并上传文档后才可用。Actions 负责生成并发布文档；脚本站需要单独设置简介同步来源，或手动更新简介内容。本地 `npm run dev` 只监听脚本，预览发布文档时请运行 `npm run build:readme`。

## 目录结构

```text
src/
  main.js                 启动入口：载入状态、注册同步、安装播放器与请求钩子、挂载界面
  core/
    config.js             存储键、账号角色、接口分组与默认配置
    runtime.js            脚本内部共享状态、缓存及原生浏览器方法
  accounts/
    store.js              Cookie 解析、账号导入、校验和持久化
    profiles.js           浏览器账号识别、头像及账号资料更新
    sync.js               跨标签页配置同步
    verify.js             账号有效性验证
  network/
    routing.js            请求分类、账号选择与 CSRF 替换
    signing.js            MD5、WBI 密钥及签名
    transport.js          GM 请求、响应头处理及播放进度合并
    interceptors.js       fetch、XHR、sendBeacon 代理
  player/
    playback.js           播放器预加载处理、权限同步与番剧首屏数据
  auth/
    login.js              二维码、密码、短信登录与验证码流程
  ui/
    components.js         通用 DOM、按钮、头像、通知及菜单
    panel.js              账号管理面板
    panel.css             Shadow DOM 内部样式
  vendor/
    jsencrypt.js          隔离封装的 JSEncrypt 3.5.4
    qrcode.js             隔离封装的 qrcode-generator 1.4.4
scripts/build.mjs         esbuild 构建与监听
scripts/build-readme.mjs  生成图片使用 HTTPS 地址的脚本站文档
docs/images/             README 展示图片，和文档一起提交
tests/                   Node.js 回归测试与浏览器环境模拟
userscript.meta.js       Tampermonkey 元数据模板
dist/                    生成的单文件脚本与发布版 README，不纳入版本管理
```

源码使用原生 ES Modules；esbuild 将模块、CSS 文本和第三方库内联为单个 IIFE，没有运行时模块导入或 CDN 依赖。CSS 继续挂载在原来的 Shadow DOM 中。`runtime` 仅在脚本闭包内部共享，不挂到页面全局对象上。

部分账号、登录和界面模块相互调用；模块顶层只声明函数与状态，启动副作用集中到 `main.js`。调整依赖时，不要在模块加载阶段调用依赖尚未初始化状态的函数。

原根目录 `bilibili-multi-account.js` 已拆分到上述模块，后续请修改 `src/`，由构建生成安装文件。版本号以 `package.json` 为准，构建时覆盖元数据模板的 `@version`，省略值为零的补丁版本位：npm 版本 `1.0.0` 对应脚本版本 `1.0`。权限、匹配站点与运行时机在 `userscript.meta.js` 中维护。

## 验证与边界

测试保留播放器启动不重载、账号路由、播放进度来源、显式同步和番剧回调的回归检查；新增完整安装包的 fetch/XHR 路由、跨标签页更新、顶层页面启动，以及 RSA/二维码库验证。测试使用虚拟账号和响应，不读取真实凭据、不访问 B 站。

这些测试不代替真实浏览器验收。登录验证码、Tampermonkey Cookie 隔离支持、网站实际播放器与面板布局仍需在浏览器中检查。页面关闭时，GM 请求可能被取消，因此 `sendBeacon` 代理不能保证退出瞬间的观看上报成功。

GitHub Actions 在推送代码和提交合并请求时执行 `npm ci` 与 `npm run check`，并上传生成的安装文件供下载。

## 自动发布到 Releases

将改动提交并推送到 GitHub 后，推送以 `v` 开头、与 `package.json` 版本一致的标签，即会在检查通过后自动创建 GitHub Release，生成更新说明，并附上 `bilibili-multi-account.user.js` 安装文件与面向脚本站的 `README.md`。

当前 npm 版本为 `1.0.0`，可使用 `v1.0` 或 `v1.0.0` 标签；同一版本选用一种写法即可。例如：

```sh
git tag v1.0
git push origin v1.0
```

后续发布时，先更新 `package.json` 和锁文件中的版本，构建并提交改动，再推送对应标签。标签版本不匹配或检查失败时，流程会停止。普通分支推送和合并请求只执行检查。

发布使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需额外配置密钥。构建任务只有读取权限，发布任务才拥有创建 Release 所需的 `contents: write` 权限。运行进度可在仓库的 Actions 页面查看，安装文件可在 Releases 页面下载。

## 来源与许可

项目沿用原脚本声明的 `GPL-3.0-only`。

第三方代码从原脚本原样提取，保留其许可声明和隔离工厂：

- JSEncrypt 3.5.4：<https://github.com/travist/jsencrypt>，MIT。
- qrcode-generator 1.4.4：<https://github.com/kazuhikoarase/qrcode-generator>，MIT。

更新第三方库时需同时保留许可文本，检查其隔离封装，并运行 `npm run check`。
