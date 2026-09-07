# 私有分发和访问方式

本次目标仓库：`liuguanyi-linux/taizhou-golf-gps`。只上传虚拟图 / GPS 相关交付包，不推送朋友原仓库。仓库保持 private；Release 与源码同样需要已获授权的 GitHub 账号。

## 如何交给朋友

仓库拥有者在 Settings → Collaborators 中核实并邀请朋友 GitHub 账号；朋友接受邀请后可阅读文档、下载 Release 完整 ZIP，再在自己电脑上运行。不知道账号时不应邀请推测的用户。

注意：个人账号仓库的协作者通常同时具备读写权限，并不等于“只读观看”。如仅允许观看和下载，可自行将 ZIP 私下发送朋友；若需要严格只读账号控制，需要组织仓库或另行设计访问方式。[GitHub 权限说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository)

## 私有仓库不等于私有网页

本次**不启用 GitHub Pages**，不发布公共匿名网址。常规 Pages 不能因为仓库 private 就当成访问受限网站；GitHub 的私有 Pages 有组织/Enterprise 等条件。[GitHub 私有 Pages 说明](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)

因此仓库地址是受权限控制的代码/文档/下载入口，不是在线运行的球洞地图。希望朋友不安装直接在线操作时，需另外确定带登录和朋友名单控制的 HTTPS 托管服务，不能只给页面加一个前端密码，也不能把一个没人知道的公网链接当成私有。

## 本机和现场测试

启动器只监听 127.0.0.1:3034，不暴露到局域网或公网。无后端账户服务、自动云保存或定位上传。外部底图请求仍会访问各提供商，离线时用已打包虚拟图和数据验证。

手机/球车现场 GPS 需要安全上下文、位置权限和真实设备信号。本机 localhost 测试不能替代现场验证；用手机访问电脑 HTTP 局域网地址也不能保证定位授权可用。先确定 HTTPS 与访问保护，再开展跨设备现场测试。

## 发布复现

运行 `node scripts/check.cjs`，确认通过后运行 `node scripts/build-delivery.cjs` 生成基线导出、图片清单与 SHA-256。完整 ZIP 应从仓库干净快照生成，排除 `.git`、本机密钥和依赖缓存。Release 记录版本与对应提交，并附 ZIP 哈希。

删除好友访问不能追回其已经下载的文件。此包不构成对第三方源码或影像的开放授权；请同时保留 LICENSE / NOTICE。
