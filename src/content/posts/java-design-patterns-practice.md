---
title: "常见设计模式面试与实战：从单例、策略到规则树"
description: "以优惠计算、支付渠道和订单风控为例，理解单例、工厂、策略、责任链与规则树的用途、实现和取舍。"
pubDate: 2026-11-02
category: "Backend"
tags: ["Java", "Design Patterns", "面试", "Backend"]
---

一个下单接口往往要完成参数校验、风险检查、优惠计算和支付渠道选择。业务刚开始很简单，随着规则增加，代码中可能出现越来越多的 `if-else`。设计模式的作用不是消灭所有条件判断，而是帮助我们识别变化发生的位置，让职责和扩展方式更清晰。

本文以 Java 后端业务为背景，介绍单例、工厂、策略、责任链和规则树，重点关注它们解决的问题和使用边界。示例为便于阅读省略 import，使用 Java 17 语法；各小节是独立示例。

## 一、先用订单场景理解它们

假设一个营销系统需要处理用户下单：

```text
请求进入
  ↓
订单校验责任链：参数 → 库存 → 风控
  ↓
规则树：根据用户和订单特征选择优惠结果
  ↓
策略：按优惠类型计算金额
  ↓
工厂：根据支付方式选择处理器
  ↓
创建支付请求
```

这里是帮助理解的示意流程，并不是每个项目都需要把这些模式全部放在一起。规则较简单时，一个清楚的条件判断可能就足够。

| 方式 | 要解决的问题 | 典型场景 |
| --- | --- | --- |
| 单例 | 在特定范围内复用同一个实例 | 无状态工具或共享配置对象 |
| 策略 | 多种算法实现同一项职责，按条件选择 | 不同优惠计算方式 |
| 工厂 | 集中创建或选择对象，隐藏获取细节 | 根据渠道获取支付处理器 |
| 责任链 | 多个处理节点依次执行，可提前终止 | 订单校验、审批流程 |
| 规则树 | 根据条件分支逐步决策，最终到达结果 | 用户分层、营销资格判断 |

规则树是常见的决策建模方式，并非 GoF 经典 23 种设计模式之一。它可以由组合模式等方式实现，也可以使用规则引擎；不要因为名字里有“树”就默认需要引入复杂框架。

## 二、单例模式：控制实例数量

### 场景：复用不可变的规则配置

如果一个对象只保存应用启动时确定的配置，并且希望在一个类加载器范围内共享，可以使用枚举单例：

```java
public enum RuleSettings {
    INSTANCE;

    private final int maxItems = 100;

    public int maxItems() {
        return maxItems;
    }
}

int limit = RuleSettings.INSTANCE.maxItems();
```

枚举的初始化由 JVM 负责，使用方式简单，也能避免常见的序列化重复创建问题。这里的配置是固定示例；如果配置需要热更新，就需要另外设计更新和可见性机制。

**单例并不自动保证对象内部状态的线程安全。** 如果多个线程同时修改共享字段，仍然需要同步、不可变对象或其他并发控制。同一个 JVM 中不同类加载器也可能分别加载出各自的实例；多个应用进程或多台机器更不会自动共享一个实例。

在依赖注入容器中，通常可以将无状态服务交给容器管理。容器的 singleton 通常是**每个容器内每个 Bean 定义一个共享实例**，不等于整个系统只有一个实例。

### 面试追问：双重检查锁定为什么需要 volatile？

延迟初始化的双重检查锁定需要正确发布对象；`volatile` 提供可见性并约束相关重排序，避免其他线程观察到尚未安全发布的实例。实际编码时还要确保两次检查和同步块都正确；没有明确需求时，优先选更容易维护的实现。

## 三、策略模式：把可替换的算法分开

### 场景：不同优惠类型使用不同计算方式

假设系统支持无优惠和九折优惠。它们都要接收原价并返回优惠后的金额，变化的是计算方式：

```java
interface DiscountStrategy {
    BigDecimal apply(BigDecimal amount);
}

final class NoDiscount implements DiscountStrategy {
    public BigDecimal apply(BigDecimal amount) {
        return amount;
    }
}

final class PercentageDiscount implements DiscountStrategy {
    private final BigDecimal rate;

    PercentageDiscount(BigDecimal rate) {
        if (rate == null || rate.compareTo(BigDecimal.ZERO) < 0
                || rate.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("折扣系数必须在 0 到 1 之间");
        }
        this.rate = rate;
    }

    public BigDecimal apply(BigDecimal amount) {
        return amount.multiply(rate).setScale(2, RoundingMode.HALF_UP);
    }
}
```

调用方根据业务规则选择策略：

```java
DiscountStrategy strategy = new PercentageDiscount(new BigDecimal("0.90"));
BigDecimal payable = strategy.apply(new BigDecimal("100.00")); // 90.00
```

这里用 `BigDecimal` 而非 `double` 表达金额。示例假设输入金额已校验且币种按两位小数处理；真实系统需要根据币种、舍入规则、优惠叠加和金额下限统一定义精度。

策略模式将不同算法隔离，方便单独测试，但**仍需要某处负责选择策略**。如果算法只有两行且永远不会变化，额外增加接口和多个类可能得不偿失。

## 四、工厂模式：集中对象的创建或选择

### 场景：根据支付渠道选择处理器

支付渠道的调用方式不同，但下单服务只希望获得一个符合统一接口的处理器：

```java
interface PaymentHandler {
    String channel();
    void pay(String orderId, BigDecimal amount);
}

final class PaymentHandlerFactory {
    private final Map<String, PaymentHandler> handlers;

    PaymentHandlerFactory(List<PaymentHandler> handlers) {
        Map<String, PaymentHandler> registry = new HashMap<>();
        for (PaymentHandler handler : handlers) {
            if (registry.putIfAbsent(handler.channel(), handler) != null) {
                throw new IllegalArgumentException("重复的支付渠道：" + handler.channel());
            }
        }
        this.handlers = Map.copyOf(registry);
    }

    PaymentHandler get(String channel) {
        PaymentHandler handler = handlers.get(channel);
        if (handler == null) {
            throw new IllegalArgumentException("不支持的支付渠道：" + channel);
        }
        return handler;
    }
}
```

```java
// handlers 由应用启动时组装，例如包含银行卡和钱包处理器。
PaymentHandlerFactory factory = new PaymentHandlerFactory(handlers);
PaymentHandler handler = factory.get("wallet");
handler.pay(orderId, amount);
```

这个例子更准确地说是**处理器注册表或简单工厂式封装**：实例已由外部创建，工厂负责查找。它不同于 GoF 中通过子类重写工厂方法来创建产品的“工厂方法模式”，也不同于创建一组相关产品的“抽象工厂模式”。

策略和工厂经常一起出现：**策略定义可替换的行为，工厂负责获取合适的实现**。工厂不会凭空消除业务选择；渠道名称、注册规则和不支持的类型仍需明确处理。支付场景还需要独立考虑超时、幂等、对账和异步结果，本例没有实现这些能力。

## 五、责任链模式：让多个节点依次处理

### 场景：下单前依次校验

一个请求可能需要经过多个检查。只要某一步不通过，就停止后续流程并返回原因：

```java
record Order(String userId, int quantity) {}

interface OrderCheck {
    Optional<String> validate(Order order);
}

final class OrderValidationChain {
    private final List<OrderCheck> checks;

    OrderValidationChain(List<OrderCheck> checks) {
        this.checks = List.copyOf(checks);
    }

    Optional<String> validate(Order order) {
        for (OrderCheck check : checks) {
            Optional<String> error = check.validate(order);
            if (error.isPresent()) {
                return error;
            }
        }
        return Optional.empty();
    }
}
```

```java
OrderCheck userCheck = order ->
        order.userId() == null || order.userId().isBlank()
                ? Optional.of("用户不能为空") : Optional.empty();
OrderCheck quantityCheck = order ->
        order.quantity() <= 0 ? Optional.of("商品数量必须大于零") : Optional.empty();

OrderValidationChain chain = new OrderValidationChain(List.of(userCheck, quantityCheck));
Optional<String> error = chain.validate(new Order("u100", 2));
```

这个实现用列表表达链，顺序由注册顺序决定；如果返回错误，后面的节点不会执行。另一类责任链会让每个节点显式持有下一个节点，或者像过滤器一样在调用下一个节点的前后处理逻辑。

上线时要明确节点顺序、短路条件和失败处理。尤其要区分“检查库存”和“扣减库存”：前者通过不代表后续扣减一定成功，并发下仍需要数据库等持久化层保证正确性。也不要随意重试带副作用的节点。

## 六、规则树：用分支组织复杂决策

### 场景：根据用户类型和订单金额选择优惠

营销规则可能是：“新用户且订单满 100 元，使用新客优惠；老用户使用会员优惠；其他情况不优惠。”可以画成一棵决策树：

```text
                  是否新用户？
                  /         \
                是           否
                ↓            ↓
          订单是否满 100？    会员优惠
             /       \
            是        否
            ↓         ↓
          新客优惠    无优惠
```

先用简洁的代码表达相同决策：

```java
record DecisionContext(boolean newUser, BigDecimal amount) {}

enum Offer { NEW_CUSTOMER, MEMBER, NONE }

static Offer decide(DecisionContext context) {
    if (context.newUser()) {
        return context.amount().compareTo(new BigDecimal("100.00")) >= 0
                ? Offer.NEW_CUSTOMER : Offer.NONE;
    }
    return Offer.MEMBER;
}
```

这段代码已经表达了树形决策，并不需要为了使用模式强行拆成多个类。当规则很多、节点可复用，或者业务人员需要配置规则时，才值得进一步抽象条件节点、分支和结果节点，并为配置增加版本、校验、灰度、审计与回滚。

规则树关注**根据条件走哪条分支**；责任链关注**按顺序执行哪些处理节点**。例如“先校验用户，再校验库存”适合表达为责任链；“新用户走 A，老用户走 B”适合表达为分支决策。二者也可以组合：责任链中的某个节点调用规则树做判断。

## 七、如何组合，如何避免过度设计

一个可行的订单处理流程可以是：先用责任链校验基本条件；再通过规则树决定优惠类型；根据该类型选择优惠策略；最后由处理器注册表选择支付渠道。每一层都应有明确输入、输出和失败行为，而不是互相直接操作对方的内部状态。

在拆分之前，可以先问自己：

1. **变化是否真实存在？** 已有多种算法或明确的扩展需求，再考虑策略；简单稳定的逻辑可以先保留条件判断。
2. **扩展点是否稳定？** 接口应该表达共同职责，而不是为了每一个分支都新建一套抽象。
3. **调用顺序是否可验证？** 对责任链和规则树，测试正常路径、边界条件、短路和错误配置，比只测试一个成功案例更重要。
4. **状态由谁管理？** 共享对象优先保持无状态或不可变；有副作用的操作需要明确并发、事务和幂等边界。

## 八、面试常见问题

**1. 单例是否一定线程安全？**

实例创建安全不代表内部业务状态安全。还要考虑共享字段是否可变、复合操作是否需要同步，以及实例的范围是否符合预期。

**2. 策略模式能完全消除 if-else 吗？**

不能。策略通常把算法选择集中到注册表、配置或工厂中；条件可能仍然存在，但算法实现不必都堆在一个方法里。

**3. 工厂模式和策略模式有什么区别？**

工厂关注对象如何创建或获取；策略关注使用哪一种可替换的行为。工厂可以负责选择并返回策略实例。

**4. 责任链和规则树有什么区别？**

责任链按顺序经过处理节点，可能中止；规则树根据条件选择分支，直到得到决策结果。复杂系统可以把两者组合，但应分别测试顺序和分支覆盖。

**5. 设计模式是否越多越好？**

不是。模式会增加间接层和理解成本。选择前应先确定实际变化、可读性收益和测试成本，保持最简单且能满足当前需求的设计。

## 九、总结

单例控制共享实例的范围，策略封装可替换的行为，工厂集中处理对象获取，责任链组织顺序处理，规则树表达条件分支。掌握这些模式的关键，是先识别业务中真正变化的部分，再选择合适的结构，并通过测试验证边界和顺序。
