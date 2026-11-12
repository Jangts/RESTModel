# 资源操作声明

`resource` 与 `defineResourcePreset` 构造资源能力声明，不执行 HTTP 请求。本文说明声明、继承与归一化规则。

```ts
import { resource, defineResourcePreset } from '@restmodel/core'

const organization = resource() // 无终端操作能力
const logs = resource({ operations: ['list', 'get'] })
const users = resource({ operations: '*' })
const settings = resource({ kind: 'singleton', operations: '*' })

const editable = resource({
  operations: {
    '*': true,
    delete: false,
    patch: { method: 'PUT' },
  },
})
```

## 精确规则

- 默认 kind 为 collection，声明的操作覆盖集合及其成员：list/post 作用于集合，get/put/patch/delete 作用于成员。
- singleton 只适用 get/put/patch/delete，星号自动排除 list/post；显式启用不适用操作会在声明时抛 ResourceConfigurationError。
- 省略 operations 且没有预设时能力为空；有预设时沿用预设。不会默认开启全套 CRUD。
- 数组只开启列出的标准操作。对象中的 true 开启，false 关闭，配置对象开启并覆盖 HTTP 方法；未声明项继承已有状态。
- `'*'` 或对象中的 `'*': true` 开启当前形态所有标准操作。先展开星号，再应用具体项，与对象键顺序无关。
- 星号跟随未来标准操作集合；希望能力固定时用明确列表。特殊动作从不包含在星号中。
- 继承采用逐层补丁：数组也是增加能力，不清空继承。空数组/空对象不清空继承，清除某项必须明确 false。
- 后代星号会重新开启祖先关闭的标准项，但保留已继承的 HTTP 方法覆盖；本层 false 最终优先。true 不撤销已有方法覆盖，恢复默认方法需要显式指定。
- scheme 负责 HTTP 适配，不赋予操作能力。
- 未知标准操作、非法方法或未知覆盖字段会报错；操作覆盖接受 method 与 scheme，其他字段会被拒绝。
- resource 配置接受 kind、operations、extends，以及客户端装配使用的 path、scheme、children、members、actions、memberActions（见[客户端参考](client.md)）；defineResourcePreset 及 extends 指向的预设只接受 operations、extends。未知自有字段（包括不可枚举字段）在声明阶段报错，不被静默忽略。
- kind 缺失或显式 undefined 时使用 collection；operations 缺失或显式 undefined 时沿用父层；extends 缺失或显式 undefined 时无父层。这些字段均不接受 null。操作覆盖中的 method 缺失时继承，但显式 undefined/null 不是合法方法。
- 所有声明与归一化结果均快照、冻结，不会修改预设或原配置。
- 配置、预设、操作映射及方法覆盖仅接受普通对象（含 null 原型对象）的自有数据属性；自定义原型、symbol 键和访问器会被拒绝。操作数组必须包含连续的自有数据元素，不能包含空洞或元素访问器。输入应为普通声明数据，不应传入 Proxy；Proxy 的反射陷阱不属于无副作用保证。
- 继承使用迭代解析，合法长链不受 JavaScript 调用栈深度限制；循环仍抛 ResourceConfigurationError。

```ts
const readonly = defineResourcePreset({ operations: ['list', 'get'] })
const articles = resource({
  extends: readonly,
  operations: { post: true, get: false },
})
// articles.operations 仅包含 list、post
// readonly 不受影响

const singletonPreset = defineResourcePreset({ operations: '*' })
const profile = resource({ kind: 'singleton', extends: singletonPreset })
// 只有 get、put、patch、delete
```

## 公共导出

`resource<T>(config?)` 返回 ResourceDefinition<T>，包含 kind 与只读 operations。每项归一化为 `{ method, target }`，target 为 collection/member/singleton。模型泛型只携带类型，不产生运行时模型类。

`defineResourcePreset(config)` 返回可复用且不可变的能力预设，支持单一 extends 逐级继承，并检查循环引用。预设保留声明层，在具体资源形态确定后才展开星号。

`standardOperations` 为唯一标准操作目录，驱动默认方法、适用位置和星号展开。公开错误类为 ResourceConfigurationError；其余公共类型从包入口导出。

TypeScript 校验操作名、HTTP 方法和配置形状；singleton 的位置适用性及继承后的有效能力由运行时归一化检查。ResourceDefinition 是声明结果，不是可以调用 get/list 的客户端；通过 createClient 装配后使用运行时资源引用。


## 配置错误定位

无效声明同步抛出 ResourceConfigurationError。错误指出声明阶段的字段位置，例如 `resource.operations[0]`、`preset.operations.get.method`；继承层以 `resource.extends(depth=2)` 标记从根声明出发的第二层预设。错误不对未知值调用自定义字符串转换，也不输出字段值。字段路径供定位使用，不应作为稳定的错误码解析；需要分支处理时使用公开错误类。
