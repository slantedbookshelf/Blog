---
title: "TypeScript 入门：从基础语法到项目结构"
description: "通过实际代码示例梳理 TypeScript 的核心语法、类型系统、接口与泛型，并给出一个可落地的项目目录结构。"
pubDate: 2026-10-16
category: "Frontend"
tags: ["TypeScript", "JavaScript", "前端", "学习笔记"]
---

TypeScript 本质上是在 JavaScript 之上加了一层类型系统。它不会让你的代码在运行时变快，却能让编辑器更早地帮你发现错误、让重构更有底气、让团队协作时少很多“这个参数到底长什么样”的猜测。

这篇文章的目标不是罗列所有语法，而是用一组够用、好懂的例子，把 TypeScript 日常开发中最常接触的概念串起来。

## 环境准备

 simplest 的入手方式是直接新建一个 Node 项目：

```bash
npm init -y
npm install -D typescript
npx tsc --init
```

`tsconfig.json` 是 TypeScript 的配置文件。初学时可以先关注这几项：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

`strict: true` 会一次性打开所有严格类型检查。刚开始可能会觉得它“找茬”，但它能逼你写出更健壮的代码。

## 基础类型

TypeScript 中最常用的原始类型和 JavaScript 完全一致，只是在变量后面加了类型注解：

```ts
let userName: string = "Alice";
let age: number = 25;
let isAdmin: boolean = false;
let nothing: null = null;
let notDefined: undefined = undefined;
```

因为 TypeScript 有类型推断，下面这种写法其实没有必要显式标注：

```ts
let userName = "Alice"; // TypeScript 自动推断为 string
```

只在推断不明显或你想强调类型时，才需要手动写注解。

### 数组与元组

数组用 `类型[]` 或 `Array<类型>` 表示：

```ts
let scores: number[] = [85, 92, 78];
let tags: Array<string> = ["ts", "js", "frontend"];
```

元组则是长度和类型都固定的数组，适合描述“一对值”这类结构：

```ts
let point: [number, number] = [10, 20];
let userWithRole: [string, boolean] = ["Bob", true];
```

### any、unknown 与 never

`any` 会关闭类型检查，尽量少用。`unknown` 是更安全的“任意类型”，使用前必须收窄：

```ts
let raw: unknown = fetchSomeData();

// 直接调用会报错
// raw.toString();

if (typeof raw === "string") {
  console.log(raw.toUpperCase()); // OK
}
```

`never` 表示“不可能存在的值”，常用于穷尽性检查：

```ts
type Status = "loading" | "success" | "error";

function handle(status: Status) {
  switch (status) {
    case "loading":
      return "加载中";
    case "success":
      return "成功";
    case "error":
      return "失败";
    default:
      // 如果上面漏了分支，这里会报错
      const _exhaustive: never = status;
      return _exhaustive;
  }
}
```

## 对象与接口

接口（`interface`）用来描述对象的形状：

```ts
interface User {
  id: number;
  name: string;
  email?: string; // 可选属性
  readonly createdAt: Date; // 只读属性
}

const alice: User = {
  id: 1,
  name: "Alice",
  createdAt: new Date(),
};
```

可选属性用 `?`，只读属性用 `readonly`。接口还能描述函数签名：

```ts
interface Comparator<T> {
  (a: T, b: T): number;
}

const compareById: Comparator<User> = (a, b) => a.id - b.id;
```

## 类型别名

类型别名（`type`）和接口很像，但更灵活。它不仅可以描述对象，还能描述联合类型、交叉类型、元组等：

```ts
type ID = string | number;
type Role = "admin" | "editor" | "viewer";

type Employee = User & {
  role: Role;
  department: string;
};
```

### interface 与 type 怎么选

| 场景 | 推荐 |
| --- | --- |
| 描述对象形状，可能需要被类实现或扩展 | `interface` |
| 联合类型、交叉类型、元组、基本类型别名 | `type` |
| 需要同名合并（declaration merging） | `interface` |

日常项目中两者可以混用，保持团队一致更重要。

## 函数

TypeScript 函数的核心是明确参数和返回值的类型：

```ts
function add(a: number, b: number): number {
  return a + b;
}

// 箭头函数
const greet = (name: string): string => `Hello, ${name}`;
```

默认参数、可选参数、剩余参数也都能标注：

```ts
function createUser(
  name: string,
  age?: number,
  ...tags: string[]
): User {
  return {
    id: Date.now(),
    name,
    createdAt: new Date(),
  };
}
```

## 泛型

泛型让函数、接口、类可以“参数化类型”。没有泛型时，为了复用同一套逻辑，你可能会写很多重复代码；有了泛型，就可以写一份逻辑，让调用者决定具体类型。

```ts
function identity<T>(arg: T): T {
  return arg;
}

let output = identity<string>("hello");
let output2 = identity(42); // 也能自动推断
```

泛型常用于封装通用数据结构。下面是一个带类型约束的缓存函数：

```ts
interface CacheItem<T> {
  value: T;
  expiry: number;
}

class SimpleCache<T> {
  private store = new Map<string, CacheItem<T>>();

  set(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiry: Date.now() + ttlMs });
  }

  get(key: string): T | undefined {
    const item = this.store.get(key);
    if (!item || item.expiry < Date.now()) return undefined;
    return item.value;
  }
}

const userCache = new SimpleCache<User>();
userCache.set("alice", alice, 60000);
```

## 类

TypeScript 的类在 ES6 Class 基础上加了访问修饰符和类型注解：

```ts
class Task {
  // public 可省略
  public title: string;
  private _done: boolean;

  constructor(title: string) {
    this.title = title;
    this._done = false;
  }

  get done(): boolean {
    return this._done;
  }

  complete() {
    this._done = true;
  }
}

const task = new Task("学习 TypeScript");
task.complete();
```

`private` 只在编译期约束，运行时可以绕过。如果确实需要硬隔离，可以用 `#done` 这种 ECMAScript 私有字段。

## 类型推断与类型断言

TypeScript 能推断出大部分类型，不需要处处写注解：

```ts
const numbers = [1, 2, 3]; // number[]
const doubled = numbers.map((n) => n * 2); // number[]
```

类型断言用于你比编译器更清楚类型的时候，用 `as` 语法：

```ts
const input = document.getElementById("username") as HTMLInputElement;
console.log(input.value);
```

但要避免用 `as` 掩盖真正的类型问题。如果你发现自己频繁断言，往往是类型设计需要调整。

## 一个可落地的项目结构

下面是一个中小型 TypeScript 前端/Node 项目的常见目录：

```text
my-project/
├── src/
│   ├── main.ts              # 程序入口
│   ├── types/               # 全局类型定义
│   │   └── index.ts
│   ├── utils/               # 工具函数
│   │   └── format.ts
│   ├── services/            # 业务接口/数据层
│   │   └── userService.ts
│   └── components/          # UI 组件（前端项目）
│       └── UserCard.ts
├── dist/                    # 编译输出
├── tests/
│   └── userService.test.ts
├── tsconfig.json
├── package.json
└── README.md
```

对于纯 Node 项目，通常会再加一个 `src/app.ts` 或 `src/index.ts` 作为入口；对于前端项目，框架（Vite、Astro 等）会有自己的约定，但 `src/types`、`src/utils`、`src/services` 的分层思路是通用的。

## 实战：一个简单的用户管理模块

把上面的知识点串起来，写一个最小但完整的用户管理模块：

```ts
// src/types/user.ts
export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
}

// src/utils/validate.ts
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// src/services/userService.ts
import { User } from "../types/user";
import { isValidEmail } from "../utils/validate";

export class UserService {
  private users: User[] = [];

  add(user: Omit<User, "id">): User {
    if (!isValidEmail(user.email)) {
      throw new Error("Invalid email");
    }

    const newUser: User = {
      id: this.users.length + 1,
      ...user,
    };

    this.users.push(newUser);
    return newUser;
  }

  findById(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  list(): readonly User[] {
    return this.users;
  }
}
```

这里用到了几个实用技巧：

- `Omit<User, "id">` 派生出一个“创建时不需要 id”的类型。
- `readonly User[]` 让外部调用者不能绕过服务直接修改数组。
- `User | undefined` 明确表达了“可能找不到”。

使用它：

```ts
// src/main.ts
import { UserService } from "./services/userService";

const service = new UserService();

const alice = service.add({
  name: "Alice",
  email: "alice@example.com",
  role: "admin",
});

console.log(service.findById(alice.id));
```

## 总结

TypeScript 的学习曲线主要在“类型思维”上，而不是语法本身。记住这几个原则：

1. **优先让类型推断工作**，只在需要清晰或复杂的地方写注解。
2. **用接口描述对象形状，用类型别名描述联合/交叉/元组**。
3. **泛型解决“逻辑相同、类型不同”的复用问题**。
4. **any 是最后的手段**，unknown 比它安全得多。
5. **类型系统服务于代码可维护性**，不要为了类型而类型。

入门之后，下一步可以深入了解条件类型、映射类型、类型守卫、`infer` 和模板字面量类型。但日常项目里，这篇文章覆盖的内容已经能应对大部分场景。
