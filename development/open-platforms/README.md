# 开放平台终端 Demo 与真实集成测试

这里运行真实 HTTP 请求，不提供伪造的服务或响应。共用配置位于 [platforms.mjs](platforms.mjs)，Demo 在 [demo.mjs](demo.mjs)，测试在 [live.test.mjs](live.test.mjs)。通过工作区构建出的主包公开入口使用 createClient、resource、action、resourceOf 和 dataOf，不导入库内部模块，不配置自定义 Transport。

## 运行

Node.js 22+，在仓库根目录安装依赖后执行：

```sh
pnpm install
pnpm demo:gitee
pnpm demo:github
pnpm test:live
```

`pnpm demo` 默认运行 Gitee；也可使用 `pnpm demo github`。`pnpm demo --help` 查看命令。所有入口都会先构建主包，再运行脚本，无需事先发布 npm 包。

Demo 逐步输出实际 GET 地址、HTTP 状态、真实列表摘要、分页信息、实体后续读取和多参数 action 返回的仓库信息。没有提供总数时显示 unknown，不把数组长度当作 total。空页按真实返回展示，不填充样本数据。

## 两个平台

| 平台 | 真实资源 | 成员身份 | 分页 |
| --- | --- | --- | --- |
| Gitee | mindspore/mindspore 的 Releases | id | page、per_page |
| GitHub | octocat/Hello-World 的 Issues | number | page、per_page |

- [Gitee 官方 API 文档](https://gitee.com/api/v5/swagger#/Repositories/getV5ReposOwnerRepoReleases)，[公开 Releases](https://gitee.com/api/v5/repos/mindspore/mindspore/releases)。
- [GitHub 官方 Issues API](https://docs.github.com/en/rest/issues/issues#list-repository-issues)。GitHub Issues 接口也返回 Pull Request，Demo 保留服务原始语义，不把所有记录都宣称为独立 Issue。

两个客户端的资源名分别为 releases 和 issues。GitHub 配置 identity: number，以避免错误地用全局 id 请求仓库成员接口。scheme 一次将分页大小字段映射到 per_page。客户端默认使用 Fetch，钩子只记录实际请求或响应，不替换网络。

仓库查询通过 `repository` action 调用，路径 `/repos/:owner/:repo` 消费 owner、repo 两个输入字段。Gitee 保留服务根路径 `/api/v5`，GitHub 使用 API 根路径；二者均不把路径字段重复发送为 query。

## 测试覆盖

每个平台包含四个真实接口检查：

1. 列表返回 ResourceList，记录与原始 HTTP body 一致；最终地址含正确的 page/per_page，没有默认 size。
2. 从当前真实列表选取实体，通过 resourceOf(entity).get() 使用 id 或 number 继续读取，验证地址和结果，并确认已完成的筛选、分页参数不会泄漏到成员请求。
3. 读取第二页，核对分页元信息与列表包装；不假定外部数据数量，允许平台返回空页。
4. 调用多参数 repository action，验证最终路径、仓库身份，以及路径字段未重复进入 query/body。

Node 测试报告包含 2 个平台父项和 8 个接口子项，全部通过时报告 10 项通过。失败不跳过，不改用 Mock，也不自动重试。每次请求超时 15 秒，两平台顺序运行。

## 范围

本次 Demo 与测试只访问公开 GET 接口，不读取本机登录或组织权限，不使用 Token，也不执行平台写操作。它们独立于默认 `pnpm test` 和 `pnpm check`；普通本地检查不访问这两个外部平台。

外部平台的网络、限流、接口策略和公开数据可能变化；这些问题会报告为 live 失败，不能直接等同于库回归。只有公开读取和 action 路径填充经过真实平台验证；写操作仍由本机 HTTP 测试覆盖，未声称完成外部平台写入验证。
