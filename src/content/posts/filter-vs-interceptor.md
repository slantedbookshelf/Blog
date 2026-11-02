---
title: "过滤器和拦截器有什么区别？从请求链路到 Spring Boot 实战"
description: "结合 Servlet 请求链路和 Spring MVC 示例，理解过滤器与拦截器的执行时机、使用方式、适用场景和常见误区。"
pubDate: 2026-11-02
category: "Backend"
tags: ["Java", "Servlet", "Spring MVC", "Spring Boot"]
---

在 Java Web 项目中，我们经常需要在业务代码执行前后做一些公共处理：记录请求耗时、生成追踪 ID、校验登录状态等。过滤器（Filter）和拦截器（Interceptor）都能在请求处理过程中加入逻辑，也都可以阻止请求继续向后执行。那么，它们究竟有什么区别？

本文以 Servlet 环境下的 Spring MVC 应用为例，从一次请求的完整路径出发，结合代码理解两者的边界和选择方式。

## 一、先看一次请求经过了什么

对于一个正常完成的同步 Spring MVC 请求，链路可以简化为：

```text
客户端请求
    ↓
Servlet 容器中的 Filter（chain.doFilter 之前）
    ↓
DispatcherServlet → HandlerMapping 找到处理器
    ↓
Interceptor.preHandle
    ↓
Controller 方法
    ↓
Interceptor.postHandle
    ↓
视图渲染（如果有）
    ↓
Interceptor.afterCompletion
    ↓
Filter（chain.doFilter 返回之后）
    ↓
客户端收到响应
```

可以把 Filter 理解为包在 Servlet 外面的一层，把 Interceptor 理解为 Spring MVC 调用处理器时的一个扩展点。**通常请求进入时 Filter 先执行，返回时则先结束 Interceptor，再回到 Filter。** 多个过滤器和拦截器分别组成链，进入和退出通常呈相反顺序。

上图是便于理解的同步成功路径：请求可能被提前拦截、抛出异常或进入异步处理，因此并非每次都会执行图中的所有步骤。

## 二、核心区别

| 对比维度 | 过滤器 Filter | 拦截器 HandlerInterceptor |
| --- | --- | --- |
| 所属规范 | Servlet 规范，由 Servlet 容器管理过滤链 | Spring MVC 的处理器拦截机制 |
| 作用位置 | 在目标 Servlet 前后，通过过滤链处理 | 在 `DispatcherServlet` 找到处理器之后、调用处理器的过程中处理 |
| 作用范围 | 由注册的 URL、Servlet 和调度类型决定，可覆盖非 Spring MVC 请求 | 由 Spring MVC 的 HandlerMapping 和注册规则决定，也可能应用于静态资源处理器 |
| 主要接口 | `jakarta.servlet.Filter`，核心方法为 `doFilter` | `HandlerInterceptor`，常用 `preHandle`、`postHandle`、`afterCompletion` |
| 获取的信息 | 可以处理或包装请求、响应，但通常不知道最终 MVC 处理器 | 可以访问 `handler`，例如获取 Controller 方法和注解 |
| 中断方式 | 不调用 `chain.doFilter`，自行设置响应 | `preHandle` 返回 `false`，自行设置响应 |
| 典型用途 | 请求包装、编码、通用响应头、安全过滤链等 | 基于处理器信息的日志、指标和业务上下文处理 |

两者都可以由 Spring 管理并注入 Bean，不能简单地说“Filter 不能注入依赖”。同样，日志、跨域和认证等需求并非由某一种机制独占，需要结合处理范围和框架能力选择。

## 三、Filter：在 Servlet 外层处理请求

Filter 的核心是 `chain.doFilter(request, response)`：调用之前处理请求，调用返回之后处理响应；如果不调用，后续过滤器和目标 Servlet 就不会执行。

下面的例子记录一次同步请求在过滤链中的耗时。示例基于 **Spring Boot 3 / Spring Framework 6**，使用 `jakarta.servlet`；Spring Boot 2 对应的包名通常是 `javax.servlet`。示例省略 import。

```java
@Component
@Order(1)
public class RequestTimingFilter implements Filter {
    private static final Logger log = LoggerFactory.getLogger(RequestTimingFilter.class);

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            log.info("method={} path={} elapsedMs={}",
                    httpRequest.getMethod(), httpRequest.getRequestURI(), elapsedMs);
        }
    }
}
```

在 Spring Boot 的 Servlet 应用中，声明为 Bean 的 Filter 会被注册到容器；`@Order` 用于控制多个过滤器的顺序。需要精确指定 URL 或调度类型时，可以使用 `FilterRegistrationBean` 配置，注意不要重复注册同一个 Filter。

`try/finally` 确保下游抛出异常时也能记录耗时。这个时间覆盖下游同步过滤链与 Servlet 处理，但如果请求启动异步处理，`chain.doFilter` 返回并不意味着整个响应已经完成。生产日志还应避免记录密码、令牌或敏感请求体。

## 四、Interceptor：感知 Spring MVC 处理器

拦截器除了能处理请求，还能拿到即将执行的 `handler`。例如，我们可以记录具体的 Controller 类和方法。

```java
@Component
public class HandlerLogInterceptor implements HandlerInterceptor {
    private static final Logger log = LoggerFactory.getLogger(HandlerLogInterceptor.class);

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        if (handler instanceof HandlerMethod method) {
            log.info("handler={}.{}", method.getBeanType().getSimpleName(),
                    method.getMethod().getName());
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        log.info("completed path={} status={}", request.getRequestURI(), response.getStatus());
    }
}
```

仅声明 Bean 还需要将其注册到 MVC：

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final HandlerLogInterceptor handlerLogInterceptor;

    public WebConfig(HandlerLogInterceptor handlerLogInterceptor) {
        this.handlerLogInterceptor = handlerLogInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(handlerLogInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/health");
    }
}
```

三个常用回调各有用途：

- **`preHandle`**：处理器调用前执行。返回 `true` 继续；返回 `false` 则终止后续处理，需要自己准备响应。
- **`postHandle`**：处理器正常执行后调用，传统 MVC 场景下可在视图渲染前处理 `ModelAndView`。处理器抛异常时不要依赖它执行；对于 `@ResponseBody`，响应体通常已在此之前写入，不适合在这里统一修改。
- **`afterCompletion`**：整个 MVC 处理完成后调用，适合清理资源。它只会对自身 `preHandle` 成功返回 `true` 的拦截器调用；已被异常解析器处理的异常也未必会出现在 `ex` 中。

如果通过 `ThreadLocal` 保存上下文，要在合适的完成回调中清理，避免线程复用时数据串扰。异步请求会释放原始容器线程并可能再次派发，不能直接套用同步执行顺序或假设线程上下文自动传递，应结合 Spring MVC 的异步回调专门处理。

## 五、实践中如何选择

**基础设施层面的处理优先考虑 Filter。** 例如，请求和响应包装、设置通用响应头、编码处理，或者让多个 Servlet 共享的规则。Filter 可以包装 `HttpServletRequest` 和 `HttpServletResponse` 后传给过滤链，而拦截器不能通过其接口替换传入链中的对象。

**需要知道具体处理器时考虑 Interceptor。** 例如按 Controller 方法或自定义注解补充日志、建立业务上下文，或记录处理器相关指标。对标准 HTTP 指标，也可以优先使用框架已有的观测能力，避免重复埋点。

**认证和授权应放在可靠的安全边界。** Spring 官方不建议将 MVC 拦截器作为主要安全层：拦截器路径匹配与注解控制器的匹配可能出现差异。通常应使用基于 Servlet Filter 链的 Spring Security，尽早完成认证与授权；拦截器可以承担不作为唯一安全保障的业务辅助逻辑。

**跨域应统一配置。** 跨域预检请求可能不会像普通业务请求一样到达预期处理器，优先使用 Spring MVC 的 CORS 配置；如果接入 Spring Security，还要确保其安全链正确处理 CORS。不要在多个位置重复设置互相冲突的跨域响应头。

## 六、常见面试追问

**1. Filter 一定比 Interceptor 先执行吗？**

在同一次正常的 Servlet 请求派发中，匹配的 Filter 位于 `DispatcherServlet` 外层，因此进入时先执行；但过滤器是否匹配、请求是否进入 Spring MVC、是否发生异步或错误派发，都影响实际结果。返回阶段则是内层先结束。

**2. Filter 和 Interceptor 都能拦截所有请求吗？**

不能。Filter 的范围由容器注册和调度类型等决定；Interceptor 只参与其所注册的 Spring MVC 处理链。未命中的路径、其他 Servlet、静态资源映射及异常派发都要结合实际配置判断。

**3. Filter 和 Spring AOP 有什么区别？**

Filter 面向 Servlet 请求链；Interceptor 面向 MVC 处理器；Spring AOP 面向 Spring 管理的对象方法调用。比如统计一个 Service 方法的调用耗时，通常更适合用 AOP；要读取请求并包装响应，则应考虑 Filter。

## 七、总结

过滤器和拦截器都能在请求过程中添加公共逻辑，但它们处在不同的层次：**Filter 围绕 Servlet 过滤链工作，Interceptor 围绕 Spring MVC 处理器工作**。理解请求链路、注册范围和异常及异步场景，比单纯记住“谁先谁后”更有助于在项目中做出正确选择。

参考资料：[Spring MVC 拦截器](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/handlermapping-interceptor.html)、[注册拦截器](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/interceptors.html)、[Spring MVC 异步请求](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html)。
