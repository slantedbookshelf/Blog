---
title: "Gin 框架实战：从零搭一个能跑、能测、能上线的 Todo API"
description: "从 net/http 讲起，用注册登录、JWT 鉴权、参数校验、中间件、统一响应、分层设计和 httptest 单测，完整实现并验证一个 Gin 项目。"
pubDate: 2026-11-13
category: "Backend"
tags: ["Go", "Gin", "Web 开发", "API 设计", "实战"]
---

大多数 Gin 教程停在 `r.GET("/ping", ...)`，但一写到真实接口就会撞上一串问题：登录态放哪里、参数怎么校验、错误怎么统一返回、业务代码该放哪个目录、panic 了怎么办、接口怎么测、服务怎么平滑重启。

本文不聊"Gin 有多快"，而是把这条链路一次走完：先搞清楚 Gin 究竟替标准库做了什么，再逐层实现一个带注册登录（bcrypt + JWT）、任务增删改查、分页筛选、统一响应、请求日志、异常恢复、跨域和优雅关闭的待办 API，最后补上单元测试和生产化改造。

文中的代码不是示意伪代码：示例项目在 Go 1.27 + Gin v1.12 下 `go build ./...` 编译通过，`go test ./...` 的 11 个用例全部通过，第六节的 curl 输出来自真实启动的服务。

## 一、先搞清楚 Gin 到底帮你做了什么

Gin 不是另一套服务器，它是**构建在 `net/http` 之上的路由 + 上下文 + 中间件框架**。先看不用框架时写一个接口要做什么：

```go
package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func main() {
	http.HandleFunc("/hello/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/hello/")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "hi " + name})
	})
	_ = http.ListenAndServe(":8080", nil)
}
```

方法判断、路径截取、JSON 编码、状态码、错误响应，全都要自己写。接口一多，日志、鉴权、panic 恢复这些横切逻辑会重复出现在每个 handler 里。同样的功能用 Gin 写：

```go
package main

import "github.com/gin-gonic/gin"

func main() {
	r := gin.Default()
	r.GET("/hello/:name", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "hi " + c.Param("name")})
	})
	_ = r.Run(":8080")
}
```

`gin.Engine` 本身就实现了 `http.Handler`，所以它可以塞进任何标准库服务器、加任何标准库中间件，也可以和老项目里的其他 handler 共存。理解这一点很重要：**你写的一直是 Go 的 HTTP 程序，Gin 只是把重复劳动收拢了。**

| 对象 | 作用 | 你最常用到的能力 |
| --- | --- | --- |
| `gin.Engine` | 顶层路由器，持有全局中间件和路由树 | `GET/POST/...`、`Group`、`Use`、`NoRoute`、`Run` |
| `*gin.RouterGroup` | 路由分组，前缀和中间件会向下传递 | `/api/v1`、需要鉴权的分组 |
| `*gin.Context` | 单次请求的上下文，贯穿整条中间件链 | 取参数、写响应、`Set/Get` 传值、`Next/Abort` |
| `gin.HandlerFunc` | `func(*gin.Context)`，中间件和 handler 是同一种类型 | 所有处理逻辑 |

一次请求在 Gin 里的路径大致是：

```text
客户端
  ↓
net/http Server → gin.Engine.ServeHTTP
  ↓
从 sync.Pool 取一个 *gin.Context，绑定 Request / ResponseWriter
  ↓
按 radix tree 匹配路由 → 全局中间件 → 分组中间件 → 业务 handler
  ↓                              ↑
  └────── c.Next() 之后回到各中间件"后半段" ──────┘
  ↓
写响应，Context 放回池中复用
```

这里的 `sync.Pool` 是后面很多坑的根源：**`gin.Context` 是复用的对象，请求结束后会被回收**，不能存起来，也不能随便丢进 goroutine。

顺带说一下选型，避免"因为 benchmark 快所以选它"：

| 方案 | 特点 | 什么时候合适 |
| --- | --- | --- |
| `net/http` + `ServeMux`/chi | 完全贴合标准库生态，Go 1.22 起 `ServeMux` 已支持方法 + 路径参数 | 依赖克制、想完全掌控、中间件不多 |
| Gin | 生态成熟、资料多、中间件和绑定开箱即用，仍是 Go Web 最主流的选择 | 绝大多数业务 API、团队里新人多 |
| Fiber | 基于 fasthttp，性能亮眼，但**不兼容 `net/http` 的 Handler 生态** | 明确接受生态割裂的纯 API 服务 |
| go-zero / Kratos 等 | 带代码生成、服务治理、微服务约定 | 有平台团队、需要统一工程规范 |

性能差距在真实业务里通常远小于数据库和缓存带来的开销，选框架更该看生态、可维护性和团队熟悉度。

## 二、环境准备与第一个接口

```bash
mkdir gin-todo && cd gin-todo
go mod init gin-todo
go get github.com/gin-gonic/gin@v1.12.0
go get github.com/golang-jwt/jwt/v5@v5.2.2 golang.org/x/crypto@v0.48.0 github.com/go-playground/validator/v10@v10.30.1
```

**版本提醒**：Gin v1.12 的 `go.mod` 要求 Go 1.25+。如果你的 Go 版本较低，要么升级，要么 `go get github.com/gin-gonic/gin@v1.10.0`——本文用到的 API 在那个版本也都存在，以模块自身 `go.mod` 的 `go` 指令为准。国内网络如果拉不动，可以设置 `GOPROXY=https://goproxy.cn,direct`。

`gin.Default()` 等价于下面两行，这是第一个需要弄明白的细节：

```go
r := gin.New()                    // 裸 Engine，不带任何中间件
r.Use(gin.Logger(), gin.Recovery()) // Default() = New() + 这两个
```

生产项目推荐用 `gin.New()`，自己挂中间件：日志格式、panic 后的响应体、请求 ID 通常都要定制，用默认 Logger 会和自己写的日志重复。

`r.Run(":8080")` 内部就是 `http.ListenAndServe`，**没有设置任何超时**。慢客户端可以长期占着连接，生产环境应当自己构造 `http.Server`（第六节的 `main.go` 就是这么做的）。

启动时 debug 模式会打印路由表，例如：

```text
[GIN-debug] GET    /hello/:name              --> main.main.func1 (2 handlers)
```

上线前必须设置 `GIN_MODE=release`（或代码里 `gin.SetMode(gin.ReleaseMode)`），关闭调试输出、避免把注册信息全量打到日志。`gin.SetMode` 只接受 `debug`/`release`/`test`，传别的值会直接 panic。

## 三、路由与 RESTful 设计

先把本文要实现的接口定下来，再写代码，避免边写边改路径：

| 方法 | 路径 | 说明 | 登录 |
| --- | --- | --- | --- |
| GET | `/healthz` | 健康检查，给负载均衡/K8s 探针用 | 否 |
| POST | `/api/v1/auth/register` | 注册 | 否 |
| POST | `/api/v1/auth/login` | 登录，返回 JWT | 否 |
| GET | `/api/v1/tasks` | 任务列表，支持 `page`、`page_size`、`status`、`keyword` | 是 |
| POST | `/api/v1/tasks` | 新建任务 | 是 |
| GET | `/api/v1/tasks/:id` | 任务详情 | 是 |
| PATCH | `/api/v1/tasks/:id` | 部分更新 | 是 |
| DELETE | `/api/v1/tasks/:id` | 删除 | 是 |

几个约定值得提前说清楚：

- **资源用复数名词，动作用 HTTP 方法表达**，不要 `/getTaskList`、`/deleteTask`。列表筛选用 query 参数，不要再造一个 `/tasks/search`。
- **版本前缀 `/api/v1`** 用路由组统一加，将来出 v2 时两套可以并存。
- **GET 用 query，创建/更新用 JSON body，路径 ID 用 `:id`**。
- `PATCH` 和 `PUT` 的区别：PATCH 只改传来的字段，PUT 要求完整替换。本文用 PATCH，因为"只改个状态"是最常见的场景。

```go
v1 := r.Group("/api/v1")
{
	v1.POST("/auth/register", h.Register)
	v1.POST("/auth/login", h.Login)
}

authed := r.Group("/api/v1", middleware.Auth(auth))
{
	authed.GET("/tasks", h.ListTasks)
	authed.POST("/tasks", h.CreateTask)
	authed.GET("/tasks/:id", h.GetTask)
	authed.PATCH("/tasks/:id", h.PatchTask)
	authed.DELETE("/tasks/:id", h.DeleteTask)
}
```

`Use` 在分组上的中间件**只对这一组生效**，所以鉴权不会挡住注册登录。另外补两个默认行为：

```go
r.HandleMethodNotAllowed = true // 默认方法不匹配会走 404，打开后走 405
r.NoRoute(func(c *gin.Context) { response.NotFound(c, "接口不存在") })
r.NoMethod(func(c *gin.Context) {
	response.Fail(c, http.StatusMethodNotAllowed, response.CodeBadRequest, "请求方法不支持")
})
```

**路由冲突要小心**：Gin 用前缀树匹配，同一层级混用静态路径（如 `/tasks/new`）和参数路径（`/tasks/:id`）在不同版本里行为不一致，某些组合会在启动时直接 panic。设计上避开这种写法，升级 Gin 版本时对路由做一次回归测试。

## 四、参数绑定与校验：最容易写错的地方

### 四种数据来源，四种标签

| 数据来源 | 不用绑定的写法 | 结构体标签 | 推荐方法 |
| --- | --- | --- | --- |
| 路径参数 | `c.Param("id")` | `uri:"id"` | `ShouldBindUri` |
| Query / 表单 | `c.Query("page")`、`c.DefaultQuery` | `form:"page"` | `ShouldBindQuery` |
| JSON 请求体 | `c.GetRawData()` | `json:"title"` | `ShouldBindJSON` |
| 请求头 | `c.GetHeader("X-Token")` | `header:"X-Token"` | `ShouldBindHeader` |

一个典型错误是给 GET 请求的结构体写 `json:"page"`，结果 `page` 永远是 0——**query 只认 `form` 标签**，路径参数只认 `uri`。`ShouldBind` 会根据请求方法和 `Content-Type` 自动挑 binder，方便但隐式；业务接口建议明确写成 `ShouldBindJSON` / `ShouldBindQuery`，读代码的人一眼知道数据从哪来。

### 只用 ShouldBind，不用 Bind

`c.BindJSON()` 内部走的是 `MustBindWith`：校验失败会**自动写 400 并把响应设成纯文本**，同时调用 `Abort()`。在要求统一 JSON 响应的项目里，这会直接破坏格式。

`ShouldBindJSON()` 只返回错误、不碰响应，由你决定怎么回：

```go
var req createTaskReq
if err := c.ShouldBindJSON(&req); err != nil {
	response.BadRequest(c, firstValidateMsg(err))
	return
}
```

### 请求体只能读一次

`c.Request.Body` 是流。`ShouldBindJSON` 读过一次之后就空了，第二次绑定会得到 EOF。需要在一个请求里读两次 body（例如先按通用结构解析出 `type`，再按类型解析成不同结构体）：

```go
if err := c.ShouldBindBodyWith(&base, binding.JSON); err != nil { /* ... */ }
if err := c.ShouldBindBodyWith(&detail, binding.JSON); err != nil { /* ... */ }
```

`ShouldBindBodyWith` 会把 body 缓存到 Context 里供后续复用。另一种做法是 `c.GetRawData()` 拿到字节后重置：`c.Request.Body = io.NopCloser(bytes.NewReader(raw))`。写日志中间件时尤其注意：**不要在中间件里把 body 读掉**，否则后面的 handler 会收到空请求体。

### 校验规则与中文报错

Gin 内置 `go-playground/validator/v10`，校验规则写在 `binding` 标签里：

| 标签 | 含义 | 例子 |
| --- | --- | --- |
| `required` | 必填，零值不通过 | `binding:"required"` |
| `omitempty` | 有值才校验 | `binding:"omitempty,min=1"` |
| `min` / `max` | 字符串是字符数，数字是数值，切片是长度 | `min=3,max=20` |
| `oneof` | 枚举 | `oneof=todo doing done` |
| `gte` / `lte` | 数值区间 | `gte=1,lte=5` |
| `email`、`url`、`datetime` | 格式校验 | `binding:"required,email"` |
| `eqfield` | 与另一个字段相等 | 确认密码 |
| `dive` | 深入校验切片/Map 元素 | `dive,required` |

校验失败返回的是 `validator.ValidationErrors`，可以自己映射成中文（第六节 `handler.go` 里的 `firstValidateMsg` 就是这个思路，真实运行会输出 `Title 不能为空`）。要做得更完整，可以引入 `github.com/go-playground/validator/v10/translations/zh`，通过 `binding.Validator.Engine().(*validator.Validate)` 拿到 Gin 内部那个实例，注册中文翻译器，再用 `RegisterTagNameFunc` 把 `label` 标签里的中文名作为字段名；这段注册在 `NewRouter` 里做一次即可，不要每个请求都注册。

### 三个容易被忽略的类型坑

1. **PATCH 用指针字段**。`Title *string` 才能区分"没传"（nil）和"传了空串"（`""`）。用 `string` 时两者都是零值，你无法判断该不该更新。
2. **时间默认按 RFC3339 解析**。`2026-13-45` 会绑定失败，前端传 `2026-11-20T10:00:00Z`。时区建议统一存 UTC 或带偏移，别让服务器本地时区参与隐式转换。
3. **int64 的 JSON 精度**。超过 `2^53` 的 ID 到了 JavaScript 会丢精度。雪花 ID 之类建议用 `json:"id,string"` 序列化成字符串，或直接对外用字符串 ID。

## 五、中间件：Gin 的灵魂

中间件和 handler 是同一个类型：`func(*gin.Context)`。区别只在于中间件会调用 `c.Next()` 把控制权交给后面的处理链，`c.Next()` 返回后再执行自己的后半段，形成"洋葱模型"：

```go
func Demo() gin.HandlerFunc {
	return func(c *gin.Context) {
		fmt.Println("A before")
		c.Next()
		fmt.Println("A after")
	}
}

r.Use(Demo())
r.GET("/x", func(c *gin.Context) {
	fmt.Println("handler")
	c.JSON(200, gin.H{"ok": true})
})
// 输出：A before → handler → A after
```

```text
请求 → [RequestID 前半段] → [Recovery 前半段] → [日志 前半段] → [Auth] → handler
响应 ← [RequestID 后半段] ← [Recovery 后半段] ← [日志 后半段] ← [Auth] ← handler
```

关键点：

- **不调用 `c.Next()`，后面的 handler 就不会执行**。所以"前置检查型"中间件（鉴权、限流）失败时直接写响应并 `return`。
- **`c.Abort()` 只阻止后续 handler，不会结束当前函数**。它把 Context 的 handler 索引推到末尾，但你自己的代码还会继续往下跑，必须显式 `return`，否则会出现"已经返回 401 了，业务代码还在改数据库"。
- **顺序有语义**。请求 ID 要最先生成，后面所有日志才能带上它；Recovery 要包住后面的中间件才能捕获它们的 panic；CORS 要在 Auth 之前，否则预检 `OPTIONS` 会因为没带令牌被 401；日志放在 Recovery 内侧，panic 被兜住之后仍能记下 500。
- **作用范围分三档**：`r.Use()` 全局、`group.Use()` 分组、路由参数里直接传 `r.GET(path, mw1, handler)` 单路由。
- `c.Set(key, value)` / `c.Get...` 是**同一个请求内**跨中间件传值的方式，鉴权后写入 `user_id`，handler 里读取。生产项目建议把 key 收拢成常量或封装函数，避免字符串拼错。

## 六、实战项目：逐层写出这个 Todo API

### 场景与目录

假设要给一个小团队做待办/工单服务：成员注册登录，每个人只能看和操作自己的任务，列表要能按状态和关键词筛选、分页，接口要有统一响应格式和请求追踪。麻雀虽小，登录、权限、校验、错误、日志、测试这些真实项目的要素一个不少。

```text
gin-todo/
├── go.mod
├── main.go             # 启动 http.Server、优雅关闭
├── router.go           # 路由装配（main 和单测复用同一套）
├── main_test.go        # httptest 接口测试
├── response/           # 统一响应体、错误码、分页结构
├── middleware/         # RequestID、日志、Recovery、鉴权、CORS
├── store/              # 数据访问接口 + 内存实现
├── service/            # 业务规则、JWT、密码哈希
└── handler/            # HTTP 层：绑定参数、调用 service、写响应
```

分层的理由只有一句话：**handler 不写业务规则，service 不认识 HTTP，store 不知道什么叫 JSON**。这样换数据库只动 store，改返回格式只动 response，接口测试不用起真实服务器。

`go.mod` 里的直接依赖（其余 indirect 由 `go mod tidy` 自动补全）：

```go
module gin-todo

go 1.25

require (
	github.com/gin-gonic/gin v1.12.0
	github.com/go-playground/validator/v10 v10.30.1
	github.com/golang-jwt/jwt/v5 v5.2.2
	golang.org/x/crypto v0.48.0
)
```

### 1）统一响应：`response/response.go`

```go
package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Body 是所有接口统一的响应外壳
type Body struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	Data      any    `json:"data,omitempty"`
	RequestID string `json:"request_id,omitempty"`
}

// 业务错误码：和 HTTP 状态码分开，用来表达更细的业务语义
const (
	CodeOK           = 0
	CodeBadRequest   = 10001
	CodeUnauthorized = 10002
	CodeForbidden    = 10003
	CodeNotFound     = 10004
	CodeConflict     = 10005
	CodeInternal     = 10500
)

// Page 是统一的分页结构，T 是列表元素的类型
type Page[T any] struct {
	List     []T   `json:"list"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Body{
		Code:      CodeOK,
		Message:   "ok",
		Data:      data,
		RequestID: c.GetString("request_id"),
	})
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, Body{
		Code:      CodeOK,
		Message:   "ok",
		Data:      data,
		RequestID: c.GetString("request_id"),
	})
}

func NoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

// Fail 统一写错误响应。Abort 保证后续中间件/handler 不会再往响应里写内容
func Fail(c *gin.Context, status, code int, message string) {
	c.AbortWithStatusJSON(status, Body{
		Code:      code,
		Message:   message,
		RequestID: c.GetString("request_id"),
	})
}

func BadRequest(c *gin.Context, message string) {
	Fail(c, http.StatusBadRequest, CodeBadRequest, message)
}

func Unauthorized(c *gin.Context, message string) {
	Fail(c, http.StatusUnauthorized, CodeUnauthorized, message)
}

func NotFound(c *gin.Context, message string) {
	Fail(c, http.StatusNotFound, CodeNotFound, message)
}

func Conflict(c *gin.Context, message string) {
	Fail(c, http.StatusConflict, CodeConflict, message)
}

func Internal(c *gin.Context, message string) {
	Fail(c, http.StatusInternalServerError, CodeInternal, message)
}
```

**为什么要 HTTP 状态码 + 业务码两层**：状态码给网关、CDN、浏览器和监控用，4xx/5xx 会直接影响缓存、重试和错误率告警；业务码给前端做细粒度分支（"用户名已存在""余额不足"这类语义 HTTP 状态码表达不了）。常见反模式是所有响应一律 `200` + `code`，这会让监控系统看不出失败率，也可能让网关把错误响应缓存下来。

`request_id` 放在响应体里，用户报障时贴一串 ID 就能在日志里定位整条链路。

### 2）数据层：`store/store.go`

先定义契约，再给一个零依赖的内存实现，保证代码拿来就能跑：

```go
package store

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	ErrNotFound  = errors.New("record not found")
	ErrDuplicate = errors.New("record already exists")
)

type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type Task struct {
	ID        int64      `json:"id"`
	OwnerID   int64      `json:"owner_id"`
	Title     string     `json:"title"`
	Status    string     `json:"status"`
	Priority  int        `json:"priority"`
	DueAt     *time.Time `json:"due_at"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type TaskQuery struct {
	Status   string
	Keyword  string
	Page     int
	PageSize int
}

type ListResult struct {
	Items []Task
	Total int64
}

// Store 是数据访问层的契约。业务层只依赖这个接口，
// 内存实现、MySQL 实现、测试用的 fake 都可以互相替换。
type Store interface {
	CreateUser(username, passwordHash string) (User, error)
	UserByName(username string) (User, error)
	UserByID(id int64) (User, error)

	CreateTask(t Task) (Task, error)
	TaskByID(id, ownerID int64) (Task, error)
	SaveTask(t Task) (Task, error)
	DeleteTask(id, ownerID int64) error
	ListTasks(ownerID int64, q TaskQuery) (ListResult, error)
}

// Memory 是一个可运行的内存实现，用互斥锁保证并发安全
type Memory struct {
	mu         sync.RWMutex
	users      map[int64]User
	names      map[string]int64
	tasks      map[int64]Task
	nextUserID int64
	nextTaskID int64
}

func NewMemory() *Memory {
	return &Memory{
		users: make(map[int64]User),
		names: make(map[string]int64),
		tasks: make(map[int64]Task),
	}
}

func (m *Memory) CreateUser(username, passwordHash string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.names[username]; exists {
		return User{}, ErrDuplicate
	}
	m.nextUserID++
	u := User{
		ID:           m.nextUserID,
		Username:     username,
		PasswordHash: passwordHash,
		CreatedAt:    time.Now(),
	}
	m.users[u.ID] = u
	m.names[u.Username] = u.ID
	return u, nil
}

func (m *Memory) UserByName(username string) (User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	id, ok := m.names[username]
	if !ok {
		return User{}, ErrNotFound
	}
	return m.users[id], nil
}

func (m *Memory) UserByID(id int64) (User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.users[id]
	if !ok {
		return User{}, ErrNotFound
	}
	return u, nil
}

func (m *Memory) CreateTask(t Task) (Task, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nextTaskID++
	now := time.Now()
	t.ID = m.nextTaskID
	t.CreatedAt = now
	t.UpdatedAt = now
	m.tasks[t.ID] = t
	return t, nil
}

// 注意 ownerID 参与查询条件：越权访问和"不存在"返回同一个错误
func (m *Memory) TaskByID(id, ownerID int64) (Task, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tasks[id]
	if !ok || t.OwnerID != ownerID {
		return Task{}, ErrNotFound
	}
	return t, nil
}

func (m *Memory) SaveTask(t Task) (Task, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.tasks[t.ID]; !ok {
		return Task{}, ErrNotFound
	}
	t.UpdatedAt = time.Now()
	m.tasks[t.ID] = t
	return t, nil
}

func (m *Memory) DeleteTask(id, ownerID int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tasks[id]
	if !ok || t.OwnerID != ownerID {
		return ErrNotFound
	}
	delete(m.tasks, id)
	return nil
}

func (m *Memory) ListTasks(ownerID int64, q TaskQuery) (ListResult, error) {
	m.mu.RLock()
	items := make([]Task, 0, len(m.tasks))
	for _, t := range m.tasks {
		if t.OwnerID != ownerID {
			continue
		}
		if q.Status != "" && t.Status != q.Status {
			continue
		}
		if q.Keyword != "" && !strings.Contains(strings.ToLower(t.Title), strings.ToLower(q.Keyword)) {
			continue
		}
		items = append(items, t)
	}
	m.mu.RUnlock()

	sort.Slice(items, func(i, j int) bool { return items[i].ID > items[j].ID })
	total := int64(len(items))
	start := (q.Page - 1) * q.PageSize
	if start >= len(items) {
		return ListResult{Items: []Task{}, Total: total}, nil
	}
	end := min(start+q.PageSize, len(items))
	return ListResult{Items: items[start:end], Total: total}, nil
}
```

三点值得留意：`PasswordHash` 的 `json:"-"` 保证哈希永远不会出现在响应里；所有 map 读写都在锁内（Gin 每个请求一个 goroutine，共享状态必须加锁）；`TaskByID(id, ownerID)` **把归属条件放进查询**，越权访问查不到记录，和"不存在"返回同一个错误，既不泄漏资源存在性，也不用写额外的 403 判断。

### 3）业务层：`service/service.go`

跨层错误用一个带业务码的自定义类型，数据层的 sentinel error 在这里被翻译成对客户端友好的语义：

```go
package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"gin-todo/response"
	"gin-todo/store"
)

// Error 是跨层传递的业务错误：Code 给客户端，Err 给日志
type Error struct {
	Code int
	Msg  string
	Err  error
}

func (e *Error) Error() string { return e.Msg }
func (e *Error) Unwrap() error { return e.Err }

func badRequest(msg string) *Error {
	return &Error{Code: response.CodeBadRequest, Msg: msg}
}

func unauthorized(msg string) *Error {
	return &Error{Code: response.CodeUnauthorized, Msg: msg}
}

func notFound(msg string, err error) *Error {
	return &Error{Code: response.CodeNotFound, Msg: msg, Err: err}
}

func conflict(msg string, err error) *Error {
	return &Error{Code: response.CodeConflict, Msg: msg, Err: err}
}

// ---------- JWT ----------

type Claims struct {
	UserID   int64  `json:"uid"`
	Username string `json:"uname"`
	jwt.RegisteredClaims
}

type Auth struct {
	secret []byte
	ttl    time.Duration
}

func NewAuth(secret string, ttl time.Duration) *Auth {
	if len(secret) < 16 {
		panic("JWT_SECRET 至少 16 个字符，生产环境请用随机长密钥")
	}
	return &Auth{secret: []byte(secret), ttl: ttl}
}

func (a *Auth) Sign(u store.User) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   u.ID,
		Username: u.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprint(u.ID),
			Issuer:    "gin-todo",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(a.ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.secret)
}

func (a *Auth) Parse(raw string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(raw, claims,
		func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return a.secret, nil
		},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer("gin-todo"),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	return claims, nil
}

// ---------- 业务层 ----------

// TaskPatch 用指针字段区分"没传"和"传了零值"，这是 PATCH 的关键
type TaskPatch struct {
	Title      *string
	Status     *string
	Priority   *int
	DueAt      *time.Time
	ClearDueAt bool
}

type Todo struct {
	st   store.Store
	auth *Auth
}

func NewTodo(st store.Store, auth *Auth) *Todo {
	return &Todo{st: st, auth: auth}
}

func (s *Todo) Register(username, password string) (store.User, error) {
	username = strings.TrimSpace(username)
	if n := len([]rune(username)); n < 3 || n > 20 {
		return store.User{}, badRequest("用户名长度需在 3~20 个字符之间")
	}
	if len([]byte(password)) < 8 || len([]byte(password)) > 72 {
		// bcrypt 最多只处理 72 字节，超长必须在这里拦住
		return store.User{}, badRequest("密码长度需在 8~72 字节之间")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return store.User{}, err
	}
	u, err := s.st.CreateUser(username, string(hash))
	if errors.Is(err, store.ErrDuplicate) {
		return store.User{}, conflict("用户名已被注册", err)
	}
	return u, err
}

func (s *Todo) Login(username, password string) (string, store.User, error) {
	u, err := s.st.UserByName(strings.TrimSpace(username))
	if errors.Is(err, store.ErrNotFound) {
		// 用户名不存在和密码错误返回同一句话，避免用户名枚举
		return "", store.User{}, unauthorized("用户名或密码错误")
	}
	if err != nil {
		return "", store.User{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return "", store.User{}, unauthorized("用户名或密码错误")
	}
	token, err := s.auth.Sign(u)
	return token, u, err
}

func (s *Todo) Create(ownerID int64, title, status string, priority int, dueAt *time.Time) (store.Task, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return store.Task{}, badRequest("标题不能为空")
	}
	if status != "" && !validStatus(status) {
		return store.Task{}, badRequest("status 只能是 todo/doing/done")
	}
	if priority == 0 {
		priority = 3
	}
	t := store.Task{
		OwnerID:  ownerID,
		Title:    title,
		Status:   statusOr(status), // 不传默认 todo
		Priority: priority,
		DueAt:    dueAt,
	}
	return s.st.CreateTask(t)
}

func (s *Todo) Get(ownerID, taskID int64) (store.Task, error) {
	t, err := s.st.TaskByID(taskID, ownerID)
	if errors.Is(err, store.ErrNotFound) {
		return store.Task{}, notFound("任务不存在", err)
	}
	return t, err
}

func (s *Todo) List(ownerID int64, q store.TaskQuery) (response.Page[store.Task], error) {
	q.Page, q.PageSize = normalizePage(q.Page, q.PageSize)
	if q.Status != "" && !validStatus(q.Status) {
		return response.Page[store.Task]{}, badRequest("status 只能是 todo/doing/done")
	}
	res, err := s.st.ListTasks(ownerID, q)
	if err != nil {
		return response.Page[store.Task]{}, err
	}
	return response.Page[store.Task]{
		List:     res.Items,
		Total:    res.Total,
		Page:     q.Page,
		PageSize: q.PageSize,
	}, nil
}

func (s *Todo) Update(ownerID, taskID int64, p TaskPatch) (store.Task, error) {
	t, err := s.Get(ownerID, taskID)
	if err != nil {
		return store.Task{}, err
	}
	if p.Title != nil {
		title := strings.TrimSpace(*p.Title)
		if title == "" {
			return store.Task{}, badRequest("标题不能为空")
		}
		t.Title = title
	}
	if p.Status != nil {
		if !validStatus(*p.Status) {
			return store.Task{}, badRequest("status 只能是 todo/doing/done")
		}
		t.Status = *p.Status
	}
	if p.Priority != nil {
		t.Priority = *p.Priority
	}
	if p.ClearDueAt {
		t.DueAt = nil
	} else if p.DueAt != nil {
		t.DueAt = p.DueAt
	}
	return s.st.SaveTask(t)
}

func (s *Todo) Delete(ownerID, taskID int64) error {
	err := s.st.DeleteTask(taskID, ownerID)
	if errors.Is(err, store.ErrNotFound) {
		return notFound("任务不存在", err)
	}
	return err
}

func validStatus(v string) bool {
	return v == "todo" || v == "doing" || v == "done"
}

func statusOr(v string) string {
	if v == "" {
		return "todo"
	}
	return v
}

// 分页必须设上限，否则一次请求可能把整张表拉出来
func normalizePage(page, size int) (int, int) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 10
	}
	if size > 50 {
		size = 50
	}
	return page, size
}
```

几个可以迁移到任何项目的安全约定：

- 密码用 bcrypt（自带随机盐、cost 可调），**不要用 MD5/SHA 直接哈希**；bcrypt 只处理前 72 字节，超长密码必须在入口拦住，否则会直接报错。
- 登录时"用户不存在"和"密码错误"返回**完全相同**的提示，避免用户名枚举；高并发下还可以对不存在的用户做一次 dummy bcrypt 比较来抹平时序差异，登录接口必须配限流。
- JWT 解析时用 `WithValidMethods([]string{"HS256"})` 把算法钉死，校验签发者和过期时间，防止历史上传过的 `alg: none`、算法混淆类攻击；token 里只放非敏感 ID；密钥从环境变量读且至少 16 字符，配置缺失直接 panic 属于合理的 fail-fast。
- JWT 是无状态的，**签发后无法单方面作废**。真要支持"退出登录立即失效"，得用短 access token + refresh token，或在 Redis 维护黑名单/版本号。
- `normalizePage` 同时做默认值和上限：不限制 `page_size` 等于给了一个"一次拉全表"的接口。

### 4）中间件：`middleware/middleware.go`

```go
package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"gin-todo/response"
	"gin-todo/service"
)

const RequestIDKey = "request_id"

// RequestID 给每次请求分配一个 ID，并透传到响应头，方便串联日志
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			buf := make([]byte, 8)
			if _, err := rand.Read(buf); err == nil {
				id = hex.EncodeToString(buf)
			} else {
				id = fmt.Sprint(time.Now().UnixNano())
			}
		}
		if len(id) > 64 {
			id = id[:64]
		}
		c.Set(RequestIDKey, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// AccessLog 在 c.Next() 之后才能拿到状态码和耗时
func AccessLog(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		logger.Info("http_access",
			"request_id", c.GetString(RequestIDKey),
			"method", c.Request.Method,
			"path", c.FullPath(), // 路由模板，避免把每个 ID 都当成新标签
			"status", c.Writer.Status(),
			"latency_ms", time.Since(start).Milliseconds(),
			"client_ip", c.ClientIP(),
			"errors", c.Errors.String(),
		)
	}
}

// Recovery 捕获 panic 并返回统一 JSON，同时保留堆栈给日志
func Recovery(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				logger.Error("panic_recovered",
					"request_id", c.GetString(RequestIDKey),
					"panic", fmt.Sprint(r),
					"stack", string(debug.Stack()),
				)
				if c.Writer.Written() {
					return // 响应已经开始写，不能再改状态码
				}
				response.Internal(c, "服务器内部错误")
			}
		}()
		c.Next()
	}
}

// Auth 校验 Bearer Token，并把用户身份放进 Context 给后续 handler 使用
func Auth(auth *service.Auth) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		parts := strings.Fields(header)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			response.Unauthorized(c, "缺少或格式错误的令牌")
			return // Abort 不会结束当前函数，必须显式 return
		}
		claims, err := auth.Parse(parts[1])
		if err != nil {
			response.Unauthorized(c, "令牌无效或已过期")
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}

// CORS 用白名单而不是 *，预检请求直接短路，不进入业务 handler
func CORS(allowedOrigins ...string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
			c.Header("Access-Control-Max-Age", "600")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
```

日志用 `c.FullPath()`（路由模板 `/api/v1/tasks/:id`）而不是 `c.Request.URL.Path`，否则监控里每个任务 ID 都会变成一条独立时间序列。**别在访问日志里打印请求体和完整 Authorization**——密码和令牌会直接进日志文件。CORS 用白名单 + `Vary: Origin`，带 Cookie/凭据的场景不能把 `Allow-Origin` 设成 `*`。

### 5）HTTP 层：`handler/handler.go`

这一层只做三件事：绑定参数、调业务、写响应。业务规则一条都不要写在这里。

```go
package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"

	"gin-todo/middleware"
	"gin-todo/response"
	"gin-todo/service"
	"gin-todo/store"
)

// ---------- 请求 DTO：标签决定数据从哪里来、怎么校验 ----------

type registerReq struct {
	Username string `json:"username" binding:"required,min=3,max=20"`
	Password string `json:"password" binding:"required,min=8,max=72"`
}

type loginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type createTaskReq struct {
	Title    string     `json:"title" binding:"required,max=100"`
	Status   string     `json:"status" binding:"omitempty,oneof=todo doing done"`
	Priority int        `json:"priority" binding:"omitempty,min=1,max=5"`
	DueAt    *time.Time `json:"due_at"`
}

// 指针字段：没传是 nil，传了空串是 ""，PATCH 才能区分"不修改"和"清空"
type patchTaskReq struct {
	Title      *string    `json:"title" binding:"omitempty,min=1,max=100"`
	Status     *string    `json:"status" binding:"omitempty,oneof=todo doing done"`
	Priority   *int       `json:"priority" binding:"omitempty,min=1,max=5"`
	DueAt      *time.Time `json:"due_at"`
	ClearDueAt bool       `json:"clear_due_at"`
}

type listReq struct {
	Page     int    `form:"page" binding:"omitempty,min=1"`
	PageSize int    `form:"page_size" binding:"omitempty,min=1,max=50"`
	Status   string `form:"status" binding:"omitempty,oneof=todo doing done"`
	Keyword  string `form:"keyword" binding:"omitempty,max=50"`
}

type uriID struct {
	ID int64 `uri:"id" binding:"required,min=1"`
}

// ---------- Handler ----------

type TodoHandler struct {
	svc *service.Todo
}

func NewTodoHandler(svc *service.Todo) *TodoHandler {
	return &TodoHandler{svc: svc}
}

func (h *TodoHandler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, firstValidateMsg(err))
		return
	}
	u, err := h.svc.Register(req.Username, req.Password)
	if err != nil {
		fail(c, err)
		return
	}
	response.Created(c, gin.H{"id": u.ID, "username": u.Username})
}

func (h *TodoHandler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, firstValidateMsg(err))
		return
	}
	token, u, err := h.svc.Login(req.Username, req.Password)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{
		"token":      token,
		"expires_in": 7200,
		"user":       gin.H{"id": u.ID, "username": u.Username},
	})
}

func (h *TodoHandler) CreateTask(c *gin.Context) {
	var req createTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, firstValidateMsg(err))
		return
	}
	t, err := h.svc.Create(currentUserID(c), req.Title, req.Status, req.Priority, req.DueAt)
	if err != nil {
		fail(c, err)
		return
	}
	response.Created(c, t)
}

func (h *TodoHandler) ListTasks(c *gin.Context) {
	var req listReq
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, firstValidateMsg(err))
		return
	}
	page, err := h.svc.List(currentUserID(c), store.TaskQuery{
		Status:   req.Status,
		Keyword:  req.Keyword,
		Page:     req.Page,
		PageSize: req.PageSize,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, page)
}

func (h *TodoHandler) GetTask(c *gin.Context) {
	id, ok := bindID(c)
	if !ok {
		return
	}
	t, err := h.svc.Get(currentUserID(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, t)
}

func (h *TodoHandler) PatchTask(c *gin.Context) {
	id, ok := bindID(c)
	if !ok {
		return
	}
	var req patchTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, firstValidateMsg(err))
		return
	}
	t, err := h.svc.Update(currentUserID(c), id, service.TaskPatch{
		Title:      req.Title,
		Status:     req.Status,
		Priority:   req.Priority,
		DueAt:      req.DueAt,
		ClearDueAt: req.ClearDueAt,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, t)
}

func (h *TodoHandler) DeleteTask(c *gin.Context) {
	id, ok := bindID(c)
	if !ok {
		return
	}
	if err := h.svc.Delete(currentUserID(c), id); err != nil {
		fail(c, err)
		return
	}
	response.NoContent(c)
}

// ---------- 辅助函数 ----------

func currentUserID(c *gin.Context) int64 {
	return c.GetInt64("user_id") // 由 Auth 中间件写入
}

func bindID(c *gin.Context) (int64, bool) {
	var uri uriID
	if err := c.ShouldBindUri(&uri); err != nil {
		response.BadRequest(c, "id 必须是正整数")
		return 0, false
	}
	return uri.ID, true
}

// 把业务错误翻译成 HTTP 状态码；未知错误只记日志，不把内部细节返回给客户端
func fail(c *gin.Context, err error) {
	var appErr *service.Error
	if errors.As(err, &appErr) {
		status := map[int]int{
			response.CodeBadRequest:   http.StatusBadRequest,
			response.CodeUnauthorized: http.StatusUnauthorized,
			response.CodeForbidden:    http.StatusForbidden,
			response.CodeNotFound:     http.StatusNotFound,
			response.CodeConflict:     http.StatusConflict,
		}[appErr.Code]
		if status == 0 {
			status = http.StatusInternalServerError
		}
		response.Fail(c, status, appErr.Code, appErr.Msg)
		return
	}
	slog.Error("internal_error", "request_id", c.GetString(middleware.RequestIDKey), "err", err)
	response.Internal(c, "服务器内部错误")
}

var tagMessages = map[string]string{
	"required": "不能为空",
	"min":      "长度或数值过小",
	"max":      "长度或数值过大",
	"oneof":    "取值不在允许范围内",
}

// 把 validator 的错误转成用户能看懂的一句话
func firstValidateMsg(err error) string {
	var ve validator.ValidationErrors
	if errors.As(err, &ve) && len(ve) > 0 {
		f := ve[0]
		if msg, ok := tagMessages[f.Tag()]; ok {
			return f.Field() + " " + msg
		}
		return f.Field() + " 格式不正确"
	}
	if errors.Is(err, io.EOF) {
		return "请求体不能为空"
	}
	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		return "字段 " + typeErr.Field + " 类型不正确"
	}
	return "请求参数不合法（时间请使用 RFC3339 格式，如 2026-11-13T10:00:00Z）"
}
```

`fail` 是整套错误处理的关键：**已知的 `service.Error` 翻译成对应状态码和业务码，未知错误一律记日志、对外只说"服务器内部错误"**。这样数据库连接串、SQL、堆栈都不会泄漏给客户端，同时日志里保留了完整信息。

### 6）装配与启动：`router.go` + `main.go`

把装配单独放到 `NewRouter()` 里，`main` 和单元测试就能复用完全相同的路由与中间件，不会出现"测试跑得好好的，线上少挂了一个中间件"。

```go
// router.go
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"

	"gin-todo/handler"
	"gin-todo/middleware"
	"gin-todo/response"
	"gin-todo/service"
	"gin-todo/store"
)

// NewRouter 只负责"装配"，main 和单元测试可以复用同一套路由
func NewRouter(logger *slog.Logger) *gin.Engine {
	st := store.NewMemory()
	auth := service.NewAuth(jwtSecret(), 2*time.Hour)
	svc := service.NewTodo(st, auth)
	h := handler.NewTodoHandler(svc)

	r := gin.New()
	// 默认信任所有代理会让 X-Forwarded-For 被伪造，ClientIP() 就不再可信
	if err := r.SetTrustedProxies([]string{"127.0.0.1", "::1"}); err != nil {
		logger.Warn("set_trusted_proxies_failed", "err", err)
	}

	// 顺序有讲究：RequestID 最先，Recovery 要包住它后面的所有中间件，
	// 日志放在 Recovery 内侧，这样 panic 被兜住后仍能记录 500
	r.Use(
		middleware.RequestID(),
		middleware.Recovery(logger),
		middleware.AccessLog(logger),
		middleware.CORS("http://localhost:5173"),
	)

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.NoRoute(func(c *gin.Context) {
		response.NotFound(c, "接口不存在")
	})

	v1 := r.Group("/api/v1")
	{
		v1.POST("/auth/register", h.Register)
		v1.POST("/auth/login", h.Login)
	}

	// 需要登录的接口单独分组，中间件只作用于这一组
	authed := r.Group("/api/v1", middleware.Auth(auth))
	{
		authed.GET("/tasks", h.ListTasks)
		authed.POST("/tasks", h.CreateTask)
		authed.GET("/tasks/:id", h.GetTask)
		authed.PATCH("/tasks/:id", h.PatchTask)
		authed.DELETE("/tasks/:id", h.DeleteTask)
	}
	return r
}

func jwtSecret() string {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return s
	}
	if gin.IsDebugging() {
		return "dev-only-secret-change-me" // 仅本地开发用
	}
	panic("必须通过环境变量设置 JWT_SECRET")
}
```

```go
// main.go
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	// 可选值：debug / release / test，传错会 panic
	if mode := os.Getenv("GIN_MODE"); mode != "" {
		gin.SetMode(mode)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	router := NewRouter(logger)

	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("server_started", "addr", srv.Addr, "mode", gin.Mode())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	select {
	case <-ctx.Done():
		logger.Info("shutdown_signal_received")
	case err := <-errCh:
		logger.Error("server_failed", "err", err)
	}

	// 优雅关闭：停止接收新请求，等待在途请求完成，超时才强制退出
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown_failed", "err", err)
	}
	logger.Info("server_stopped")
}
```

`SetTrustedProxies` 不是可选项：Gin 默认信任所有代理，`ClientIP()` 会读 `X-Forwarded-For`，客户端随便伪造一个头就能绕过按 IP 的限流和审计。部署在 Nginx / 网关后面时，把可信代理的网段填进去。

优雅关闭在容器环境尤其重要：K8s 发 SIGTERM 后先摘流量，如果进程直接退出，正在写数据库的请求会被硬切断；`srv.Shutdown` 会停止接收新连接并等在途请求完成，超时时间要和 `terminationGracePeriodSeconds` 对齐。

### 7）跑起来看真实输出

```bash
GIN_MODE=release JWT_SECRET=demo-secret-abcdefghijklmnop go run .
```

```bash
curl -i http://127.0.0.1:8080/healthz
# HTTP/1.1 200 OK
# X-Request-Id: 460afacdbda74fb7
# {"status":"ok"}

curl -i -X POST http://127.0.0.1:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"pass12345"}'
# HTTP/1.1 201 Created
# {"code":0,"message":"ok","data":{"id":1,"username":"alice"},"request_id":"35efa45f0be2fab7"}

curl -s -X POST http://127.0.0.1:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"pass12345"}'
# {"code":0,"message":"ok","data":{"expires_in":7200,"token":"eyJhbGciOi...","user":{"id":1,"username":"alice"}},"request_id":"b55c64a7ba0e4aad"}
```

拿到 token 后（下面用 `$TOKEN` 代替）：

```bash
curl -i -X POST http://127.0.0.1:8080/api/v1/tasks \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"写 Gin 实战博客","priority":5,"due_at":"2026-11-20T10:00:00Z"}'
# HTTP/1.1 201 Created
# {"code":0,"message":"ok","data":{"id":1,"owner_id":1,"title":"写 Gin 实战博客","status":"todo",
#   "priority":5,"due_at":"2026-11-20T10:00:00Z", ...},"request_id":"6a86554175ec586c"}

curl -s 'http://127.0.0.1:8080/api/v1/tasks?status=todo&page=1&page_size=10' \
  -H "Authorization: Bearer $TOKEN"
# {"code":0,...,"data":{"list":[...],"total":1,"page":1,"page_size":10},"request_id":"919455b74eb960de"}

curl -s -X PATCH http://127.0.0.1:8080/api/v1/tasks/1 \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"done","clear_due_at":true}'
# ..."status":"done","due_at":null...  ← 只改了传来的字段

curl -i http://127.0.0.1:8080/api/v1/tasks        # 不带令牌
# HTTP/1.1 401 Unauthorized
# {"code":10002,"message":"缺少或格式错误的令牌","request_id":"8f63bd50bab891e3"}
```

注意 `PATCH` 后的 `due_at` 变成 `null`：`clear_due_at` 是专门为"清空一个可为 NULL 的字段"设计的，光靠 `due_at: null` 与"不传"在 JSON 里都是 nil，无法区分。

## 七、给接口写测试：别只靠 Postman 点一点

Gin 的 `Engine` 就是 `http.Handler`，配合 `net/http/httptest` 可以在不监听端口、不启动数据库的情况下测完整链路，还能进 CI。`NewRouter()` 单独抽出来的价值就在这里。

```go
// main_test.go
package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newTestRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	t.Setenv("JWT_SECRET", "test-secret-abcdefghijklmnop")
	return NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func perform(r http.Handler, method, path, body, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("响应不是合法 JSON: %v, body=%s", err, w.Body.String())
	}
	return out
}

func login(t *testing.T, r *gin.Engine, user, password string) string {
	t.Helper()
	w := perform(r, http.MethodPost, "/api/v1/auth/login",
		`{"username":"`+user+`","password":"`+password+`"}`, "")
	if w.Code != http.StatusOK {
		t.Fatalf("登录失败: status=%d body=%s", w.Code, w.Body.String())
	}
	return decode(t, w)["data"].(map[string]any)["token"].(string)
}

func TestFullFlow(t *testing.T) {
	r := newTestRouter(t)

	if w := perform(r, http.MethodPost, "/api/v1/auth/register",
		`{"username":"alice","password":"pass12345"}`, ""); w.Code != http.StatusCreated {
		t.Fatalf("注册失败: status=%d body=%s", w.Code, w.Body.String())
	}
	// 重复注册应该返回 409 而不是 500
	if w := perform(r, http.MethodPost, "/api/v1/auth/register",
		`{"username":"alice","password":"pass12345"}`, ""); w.Code != http.StatusConflict {
		t.Fatalf("重复注册未被拦截: status=%d", w.Code)
	}

	token := login(t, r, "alice", "pass12345")

	created := perform(r, http.MethodPost, "/api/v1/tasks",
		`{"title":"写 Gin 博客","priority":5,"due_at":"2026-11-20T10:00:00Z"}`, token)
	if created.Code != http.StatusCreated {
		t.Fatalf("创建任务失败: status=%d body=%s", created.Code, created.Body.String())
	}
	id := int64(decode(t, created)["data"].(map[string]any)["id"].(float64))

	listed := perform(r, http.MethodGet, "/api/v1/tasks?status=todo&page=1&page_size=10", "", token)
	if listed.Code != http.StatusOK {
		t.Fatalf("列表失败: status=%d", listed.Code)
	}
	data := decode(t, listed)["data"].(map[string]any)
	if data["total"].(float64) != 1 {
		t.Fatalf("总数不对: %v", data["total"])
	}

	patched := perform(r, http.MethodPatch, "/api/v1/tasks/999", `{}`, token) // 不存在的 id
	if patched.Code != http.StatusNotFound {
		t.Fatalf("不存在的任务应返回 404, got %d", patched.Code)
	}
	patched = perform(r, http.MethodPatch, "/api/v1/tasks/"+itoa(id),
		`{"status":"done","clear_due_at":true}`, token)
	if patched.Code != http.StatusOK {
		t.Fatalf("更新失败: status=%d body=%s", patched.Code, patched.Body.String())
	}
	task := decode(t, patched)["data"].(map[string]any)
	if task["status"] != "done" || task["due_at"] != nil {
		t.Fatalf("部分更新结果不对: %v", task)
	}

	// 另一个用户不能看到 alice 的任务，且不能通过状态码区分"存在但无权"
	perform(r, http.MethodPost, "/api/v1/auth/register",
		`{"username":"bob","password":"pass12345"}`, "")
	bobToken := login(t, r, "bob", "pass12345")
	if w := perform(r, http.MethodGet, "/api/v1/tasks/"+itoa(id), "", bobToken); w.Code != http.StatusNotFound {
		t.Fatalf("越权访问应返回 404, got %d", w.Code)
	}

	if w := perform(r, http.MethodDelete, "/api/v1/tasks/"+itoa(id), "", token); w.Code != http.StatusNoContent {
		t.Fatalf("删除失败: status=%d", w.Code)
	}
}

func TestValidationAndAuth(t *testing.T) {
	r := newTestRouter(t)
	perform(r, http.MethodPost, "/api/v1/auth/register",
		`{"username":"alice","password":"pass12345"}`, "")
	token := login(t, r, "alice", "pass12345")

	cases := []struct {
		name   string
		method string
		path   string
		body   string
		token  string
		want   int
	}{
		{"用户名过短", http.MethodPost, "/api/v1/auth/register", `{"username":"a","password":"pass12345"}`, "", 400},
		{"请求体为空", http.MethodPost, "/api/v1/auth/login", "", "", 400},
		{"缺少令牌", http.MethodGet, "/api/v1/tasks", "", "", 401},
		{"伪造令牌", http.MethodGet, "/api/v1/tasks", "", "not-a-jwt", 401},
		{"分页超限", http.MethodGet, "/api/v1/tasks?page_size=999", "", token, 400},
		{"非法状态值", http.MethodGet, "/api/v1/tasks?status=unknown", "", token, 400},
		{"路径参数非数字", http.MethodGet, "/api/v1/tasks/abc", "", token, 400},
		{"时间格式错误", http.MethodPost, "/api/v1/tasks", `{"title":"x","due_at":"2026-13-45"}`, token, 400},
		{"未知路由", http.MethodGet, "/api/v1/nope", "", token, 404},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := perform(r, tc.method, tc.path, tc.body, tc.token)
			if w.Code != tc.want {
				t.Fatalf("want %d, got %d, body=%s", tc.want, w.Code, w.Body.String())
			}
		})
	}
}

func itoa(v int64) string {
	return strconv.FormatInt(v, 10)
}
```

```text
$ go test -v ./...
=== RUN   TestFullFlow
--- PASS: TestFullFlow (0.25s)
=== RUN   TestValidationAndAuth
    --- PASS: TestValidationAndAuth/用户名过短
    --- PASS: TestValidationAndAuth/请求体为空
    --- PASS: TestValidationAndAuth/缺少令牌
    --- PASS: TestValidationAndAuth/伪造令牌
    --- PASS: TestValidationAndAuth/分页超限
    --- PASS: TestValidationAndAuth/非法状态值
    --- PASS: TestValidationAndAuth/路径参数非数字
    --- PASS: TestValidationAndAuth/时间格式错误
    --- PASS: TestValidationAndAuth/未知路由
PASS
```

这 11 个用例覆盖了完整业务流、重复注册、鉴权失败、参数校验和**越权访问**。把"别人访问我的资源应返回 404"写成断言，比上线后靠人工点页面可靠得多。真实项目里还可以让 `Store` 注入一个 fake 实现，单独给 service 层写不依赖 HTTP 的单元测试。

## 八、从 demo 到生产，还差什么

### 把内存存储换成数据库

因为业务层只依赖 `Store` 接口，换 GORM 只需要新增一个实现，handler / service 一行都不用改：

```go
type GormStore struct{ db *gorm.DB }

func (g *GormStore) TaskByID(id, ownerID int64) (store.Task, error) {
	var t store.Task
	err := g.db.Where("id = ? AND owner_id = ?", id, ownerID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return store.Task{}, store.ErrNotFound // 保持接口的错误语义不变
	}
	return t, err
}
```

对应地要处理这些事：

- 给模型加 `gorm` 标签，为 `(owner_id, status)` 建联合索引；`username` 加唯一索引，把"重复注册"判断交给数据库，别只依赖先查后插（并发下会漏）。
- 列表查询用 `Count` + `Limit/Offset`，筛选条件下推到 SQL，别把整表读进内存再过滤；深分页改用游标（`WHERE id < ? ORDER BY id DESC LIMIT ?`）。
- 连接池：`sqlDB.SetMaxOpenConns` / `SetMaxIdleConns` / `SetConnMaxLifetime`；所有查询用 `db.WithContext(ctx)`，让客户端断开时数据库查询也一起取消。
- **示例里的 `Store` 方法没有 `context.Context` 参数，是为了让读者专注 Gin**。生产接口第一个参数应该是 `ctx context.Context`，从 `c.Request.Context()` 一路传下去，超时/取消才能级联。
- 本地想零配置跑 SQLite，选纯 Go 驱动（如 `glebarez/sqlite`）可以避开 CGO 和 gcc；生产用 `gorm.io/driver/mysql` 或 `postgres`。
- 严格分层时别把 `gorm` 标签直接写在领域模型上，单独定义持久化对象并做一次转换，避免 ORM 侵入业务结构。

### 配置、密钥与可观测性

- 配置统一从环境变量读（端口、`GIN_MODE`、`JWT_SECRET`、数据库 DSN），复杂场景用 viper 叠配置文件；`.env` 和任何密钥都不要进 Git。密钥轮换要考虑已签发 token 的过渡期。
- 日志用结构化的 `slog`（或 zap），把 `request_id` 贯穿访问日志、错误日志和下游调用；跨服务时接 OpenTelemetry，把 trace ID 和 request ID 关联起来。
- 接口文档用 `swaggo/swag` 从注释生成 Swagger，配合 `gin-swagger` 挂载；注释和代码放在一起才不会腐化。
- `pprof` 用独立端口和内网监听，不要挂在对外端口上。

### 限流

按 IP 的令牌桶（`golang.org/x/time/rate`）片段：

```go
func RateLimit(perSecond rate.Limit, burst int) gin.HandlerFunc {
	var mu sync.Mutex
	visitors := make(map[string]*rate.Limiter)
	return func(c *gin.Context) {
		ip := c.ClientIP()
		mu.Lock()
		lim, ok := visitors[ip]
		if !ok {
			lim = rate.NewLimiter(perSecond, burst)
			visitors[ip] = lim
		}
		mu.Unlock()
		if !lim.Allow() {
			response.Fail(c, http.StatusTooManyRequests, response.CodeForbidden, "请求过于频繁")
			return
		}
		c.Next()
	}
}
```

这是**单机版**：map 会随 IP 无限增长，需要定时清理过期项；多实例部署必须用 Redis 做分布式限流。登录、短信验证码这类接口建议再叠加按账号维度的限制。

### 部署清单

| 项 | 要做的事 |
| --- | --- |
| 运行模式 | `GIN_MODE=release`，关闭调试输出 |
| 超时 | 自构 `http.Server`，设置 Read/Write/Idle 超时 |
| 代理 | `SetTrustedProxies` 只信任网关网段 |
| 优雅关闭 | SIGTERM → `Shutdown`，超时与 K8s 宽限期对齐 |
| 健康检查 | `/healthz` 只做轻量检查；readiness 可检查 DB 连通性 |
| 密钥 | 环境变量 / Secret 注入，禁止硬编码 |
| 跨域 | 白名单 + 预检处理，别用 `*` 配凭据 |
| 安全 | HTTPS、限流、依赖定期升级、`go test -race ./...` |
| 镜像 | 多阶段构建，非 root 用户运行 |

一个可用的多阶段 Dockerfile（Go 版本按你的环境调整）：

```dockerfile
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app .

FROM alpine:3.20
RUN addgroup -S app && adduser -S -G app app
COPY --from=build /out/app /app
USER app
EXPOSE 8080
ENTRYPOINT ["/app"]
```

## 九、十个高频踩坑

**1. `c.Abort()` 之后忘了 `return`。** Abort 只是把 handler 索引推到末尾，当前函数继续往下执行。典型后果是"已经返回 401，数据库还是被写了一条"。所有提前返回的地方都补 `return`；用 `AbortWithStatusJSON` 也一样。

**2. 在 goroutine 里直接用 `c`。** `gin.Context` 从 `sync.Pool` 复用，请求结束就被回收，异步 goroutine 里读它可能拿到别的请求的数据。要在请求外使用，先 `cp := c.Copy()` 再用副本；但**副本也不能用来写响应**，异步任务的结果要通过 channel、队列或另一次请求返回。

**3. body 被读掉，handler 收到空请求。** 日志中间件里 `io.ReadAll(c.Request.Body)` 之后没重置，或者一个请求里调了两次 `ShouldBindJSON`。用 `ShouldBindBodyWith`，或 `GetRawData()` 后 `c.Request.Body = io.NopCloser(bytes.NewReader(raw))`。

**4. 用 `BindJSON` 破坏了统一响应。** 它内部走 `MustBindWith`，失败时自动写 400 纯文本。统一响应格式的项目一律用 `ShouldBind*`。

**5. 标签写错位置。** GET 的 query 用 `form`，路径参数用 `uri`，JSON 才用 `json`；`json` 标签只负责字段名，不写 `binding` 就不会校验。

**6. 路由冲突与 405。** 同一层级混用 `:id` 和静态路径可能启动 panic；方法不匹配默认走 404，要显式开 `HandleMethodNotAllowed` 并配 `NoMethod`。`NoRoute` 也建议自定义成统一 JSON，否则前端拿到的是 Gin 默认的 404 文本。

**7. `ClientIP()` 被伪造。** 默认信任所有代理，`X-Forwarded-For` 由客户端随意填写。限流、审计、风控只要按 IP 判断，就必须先 `SetTrustedProxies`。

**8. 上线忘开 release 模式 / 用 `r.Run()` 裸奔。** 前者打印路由表和调试日志，后者没有超时保护。生产入口应该是 `gin.New()` + 自建 `http.Server`。

**9. 响应写完还改状态码。** `c.JSON` 之后 `c.Status(500)` 不会生效。自定义 Recovery 里先判断 `c.Writer.Written()`，已写出就只能记日志，不能假装还能返回 500 JSON。

**10. JWT 校验不完整。** 只 `Parse` 不校验算法、过期和签发者，密钥硬编码，把手机号邮箱塞进 payload（JWT 只是签名，不是加密，内容 Base64 一解就能看）。用 `WithValidMethods` + `WithExpirationRequired` + issuer 校验，密钥走环境变量，payload 只放 ID。

再顺手记几个小坑：分页不设上限等于开放全表导出；bcrypt 超 72 字节会直接报错；超过 `2^53` 的 int64 ID 到前端会丢精度；`gin.SetMode` 传非法值会 panic；时间字段统一 RFC3339 和时区；并发访问共享 map 不加锁会在 `go test -race` 下暴露。

## 十、小结

把这条链路串起来，Gin 需要真正掌握的其实就四件事：**路由与分组怎么组织、参数从哪来并怎么校验、中间件怎么借 `Context` 串起一次请求、业务代码怎么分层才不至于全堆在 handler 里**。剩下的统一响应、错误映射、鉴权、日志、优雅关闭和测试，都是围绕这四件事的工程约定。

建议的学习顺序是：先把本文的项目照着敲一遍并跑通 `go test`；然后把 `Store` 换成真实数据库并给方法加上 `context.Context`；再补限流、配置、Swagger 和 CI；最后才去看 `gin.Context` 的源码（尤其是 `Next`、`Abort`、`Copy` 和 `Set/Get`），那时每一行都能对应到实际行为。

参考资料：[Gin 官方文档](https://gin-gonic.com/docs/)、[gin-gonic/gin 源码](https://github.com/gin-gonic/gin)、[go-playground/validator](https://github.com/go-playground/validator)、[golang-jwt/jwt](https://github.com/golang-jwt/jwt)、[Go net/http 文档](https://pkg.go.dev/net/http)、[bcrypt 文档](https://pkg.go.dev/golang.org/x/crypto/bcrypt)、[GORM 文档](https://gorm.io/docs/)、[httptest 文档](https://pkg.go.dev/net/http/httptest)。
