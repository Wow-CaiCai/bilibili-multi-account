// ==UserScript==
// @name         Bilibili Multi-Account
// @namespace    bilibili.local.multi-account
// @version      1.0
// @description  支持密码、短信、二维码登录，按主账号、记录观看、推荐和视频取流分别选择 B 站账号。
// @author       Wow-CaiCai (https://github.com/Wow-CaiCai)
// @icon         https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/users-round.svg
// @match        https://*.bilibili.com/*
// @match        https://bilibili.com/*
// @exclude      https://passport.bilibili.com/*
// @run-at       document-start
// @sandbox      raw
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @connect      api.live.bilibili.com
// @connect      api.vc.bilibili.com
// @connect      app.bilibili.com
// @connect      www.bilibili.com
// @connect      s.search.bilibili.com
// @connect      passport.bilibili.com
// @license      GPL-3.0-only
// ==/UserScript==
