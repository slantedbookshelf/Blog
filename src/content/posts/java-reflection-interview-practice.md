---
title: "Java 反射面试与实战：从动态调用到注解处理"
description: "结合对象创建、方法调用和注解校验，理解 Java 反射的工作方式、访问限制、泛型信息和常见面试追问。"
pubDate: 2026-11-02
category: "Backend"
tags: ["Java", "Reflection", "面试", "Backend"]
---

平时调用方法，我们会直接写 `user.getName()`。但一个通用工具未必提前知道要处理哪个类，更不一定知道这个类有哪些字段和方法。反射让程序在运行时读取类型信息，并通过这些信息创建对象、访问字段和调用方法。

面试中，反射经常与框架、注解、泛型和动态代理一起出现。理解它的关键是区分两件事：**获取成员的元数据，以及通过成员执行操作**。知道一个私有字段存在，并不代表一定有权限读取它。

本文以 Java 17 / 21 为背景，结合常见面试问题和小型实践展开。代码片段省略 import；完整示例需引入 `java.lang.reflect`、`java.lang.annotation` 等对应类型。

## 一、反射解决了什么问题

普通调用在编译时确定类和方法，编译器可以检查参数和返回类型。反射允许把一部分选择推迟到运行时：

```text
获取 Class 对象
    ↓
查询字段、构造器、方法或注解
    ↓
确认参数和访问权限
    ↓
创建对象 / 读取字段 / 调用方法
```

典型场景包括根据配置选择实现类、读取注解规则、把字段映射到数据结构，以及构建通用测试或框架工具。代价是部分错误要等运行时才能发现，也增加了异常处理与维护成本。

业务代码已经知道具体接口时，通常直接调用接口即可。只有确实需要处理运行时未知的类型结构时，反射才更有价值。

## 二、如何获取 Class 对象

```java
Class<String> first = String.class;
Class<? extends String> second = "hello".getClass();
Class<?> third = Class.forName("java.lang.String");
```

三种方式的使用场景不同：类字面量适合编译时已知类型，`getClass()` 获取现有对象的实际运行时类型，`Class.forName` 则按类名查找类型。

这里有两个面试细节：

- `SomeType.class` 本身不会触发该类的初始化；单参数 `Class.forName` 通常会触发初始化，也可以通过带 `initialize` 参数的重载控制。
- 类的运行时身份不仅与类名有关，还与定义它的类加载器有关。不同类加载器定义的同名类，不一定能互相转换。

`Class` 表示类型信息，不是业务实例。拿到 `User.class`，不等于已经创建了一个 `User`。

## 三、常用 API：get 和 getDeclared 的区别

| 操作 | 查询 public 成员 | 查询当前类声明的成员 |
| --- | --- | --- |
| 字段 | `getField` / `getFields`，包括继承的 public 字段 | `getDeclaredField` / `getDeclaredFields`，包括私有字段，不含继承字段 |
| 方法 | `getMethod` / `getMethods`，包括继承的 public 方法 | `getDeclaredMethod` / `getDeclaredMethods`，包括私有方法，不含继承方法 |
| 构造器 | `getConstructor` / `getConstructors`，仅 public 构造器 | `getDeclaredConstructor` / `getDeclaredConstructors`，包括非 public 构造器 |

构造器不会被继承。`getDeclared...` 中的 “Declared” 指声明范围，**不意味着自动绕过访问检查**。返回的字段、方法数组也不应被当作源码声明顺序使用。

查询重载方法时，需要提供准确的形参类型。例如声明是 `setAge(int age)`，查询就应该传 `int.class`，而不是 `Integer.class`。方法查找不会像普通 Java 调用那样自动帮你完成重载选择。相关定义见 [Class API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Class.html)。

## 四、实战一：创建对象并调用方法

假设有一个公开业务类：

```java
public class GreetingService {
    public GreetingService() {}

    public String greet(String name) {
        if (name == null) {
            throw new IllegalArgumentException("name 不能为空");
        }
        return "Hello, " + name;
    }
}
```

在另一个类的方法中执行：

```java
public static String invokeGreeting(String name)
        throws ReflectiveOperationException {
    Class<GreetingService> type = GreetingService.class;
    GreetingService service = type.getDeclaredConstructor().newInstance();
    Method method = type.getMethod("greet", String.class);

    try {
        return (String) method.invoke(service, name);
    } catch (InvocationTargetException ex) {
        throw new IllegalStateException("业务方法执行失败", ex.getCause());
    }
}
```

`invoke` 的第一个参数是目标对象，后续参数是方法实参。调用静态方法时，目标参数可以传 `null`。返回值使用 `Object` 表达，基本类型返回值会装箱，`void` 方法返回 `null`。

这里应区分两类失败：查找不到方法、对象不匹配等属于反射使用问题；业务方法内部抛出的异常则会包装为 `InvocationTargetException`，需要查看其 cause。上面的包装保留了业务原因，实际项目也可以按统一异常策略转换。

另一个容易踩的坑是数组参数：如果目标方法接收一个 `String[]`，调用时可以写 `method.invoke(target, (Object) names)`，明确将整个数组作为一个实参，避免与 `invoke` 自身的可变参数机制混淆。详见 [Method.invoke API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/Method.html#invoke(java.lang.Object,java.lang.Object...))。

创建对象优先使用 `getDeclaredConstructor(...).newInstance(...)`。不要继续使用已经弃用的 `Class.newInstance()`。

## 五、实战二：用反射读取注解并校验字段

注解本身只是元数据，不会自动执行校验。我们可以通过一个简单例子理解“注解声明规则，处理器执行规则”。

先定义一个只用于字段的注解：

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface RequiredText {}
```

再定义数据对象：

```java
public class SignupRequest {
    @RequiredText
    private final String username;

    public SignupRequest(String username) {
        this.username = username;
    }
}
```

最后读取字段与注解：

```java
public final class TextValidator {
    public static void validate(Object target) throws IllegalAccessException {
        Objects.requireNonNull(target, "待校验对象不能为空");
        for (Field field : target.getClass().getDeclaredFields()) {
            if (Modifier.isStatic(field.getModifiers()) || field.isSynthetic()) {
                continue;
            }
            if (!field.isAnnotationPresent(RequiredText.class)) {
                continue;
            }
            if (field.getType() != String.class) {
                throw new IllegalArgumentException("RequiredText 仅支持 String 字段");
            }
            if (!field.trySetAccessible()) {
                throw new IllegalStateException("无法访问字段：" + field.getName());
            }
            String value = (String) field.get(target);
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException(field.getName() + " 不能为空白");
            }
        }
    }
}
```

```java
TextValidator.validate(new SignupRequest("Ada")); // 通过
TextValidator.validate(new SignupRequest("  "));  // 校验失败
```

示例仅扫描当前类声明的实例字段，不包含父类字段，也没有处理嵌套对象、集合和循环引用；它用于解释原理，不是完整的生产校验框架。`RUNTIME` 保留策略让注解能够在运行时被反射读取。

### 为什么 trySetAccessible 也可能失败？

反射仍然受到访问规则和模块封装约束。`trySetAccessible()` 在无法开启访问时可以返回 `false`，而 `setAccessible(true)` 在相关限制下可能抛出 `InaccessibleObjectException`。不能把它们理解为任意访问 JDK 或第三方模块内部实现的通行证。

跨模块深度反射可能要求目标模块开放对应包；遇到失败时，应先确认目标 API 和模块设计，而不是盲目开放所有包。这里也只读取了 `final` 字段，不应据此推断反射能可靠修改所有 `final` 字段。详见 [AccessibleObject API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/reflect/AccessibleObject.html)。

## 六、反射能获取泛型类型吗？

上一篇泛型文章提到：类型擦除不等于所有泛型声明信息都消失。例如：

```java
public class UserGroup {
    private List<String> names;
}
```

```java
Field field = UserGroup.class.getDeclaredField("names");
System.out.println(field.getType());        // interface java.util.List
System.out.println(field.getGenericType()); // java.util.List<java.lang.String>
```

这里读取的是字段声明中的泛型签名，并不是检查列表实例内部的实际元素。如果字段声明为 `List<T>`，反射拿到的类型参数还可能是类型变量，需要结合具体继承关系继续解析。

同样，不能因为 `new ArrayList<String>()` 写了 `String`，就期待通过这个普通实例的 `getClass()` 恢复元素类型。面试回答时，应明确区分**声明元数据**和**实例中真实存储的对象**。

## 七、面试常见追问

**1. 反射为什么常见于框架？**

框架通常先定义流程，再处理使用者提供的类型。反射可以帮助它读取构造器、字段、方法和注解，从而完成对象装配、映射或分派。但实际框架还可能使用生成代码、代理和方法句柄，不能把框架能力全部归结为反射。

**2. 反射和动态代理有什么区别？**

反射用于检查类型和操作成员；动态代理用于生成代理对象，把方法调用交给统一逻辑处理。二者可以配合使用，例如代理处理器拿到 `Method` 后转发调用，但它们不是同一个概念。

**3. 反射一定很慢吗？**

不能给出脱离场景的固定倍数。查找元数据、参数包装、间接调用等可能增加成本，具体表现也与 JDK 实现和调用方式有关。实践中先避免重复扫描，在启动阶段解析并缓存所需元数据；只有热点路径出现实际性能问题时，再用基准测试评估替代方案。

**4. 缓存 Method 和 Field 有什么注意事项？**

缓存可以减少重复查找，但生命周期必须匹配应用。长期静态缓存如果持有可卸载类及其类加载器，可能影响插件卸载或热更新。不要只看到查找成本，也要考虑缓存释放和类加载器隔离。

**5. 反射能绕过泛型检查吗？**

某些情况下可以。例如通过擦除后的集合方法反射写入不符合源码泛型约束的对象，可能让错误延迟到后续读取时才暴露。因此泛型主要提供编译期保障，反射边界仍需要检查实际类型。

**6. 使用字符串指定类名有什么风险？**

重构类名时，字符串配置未必同步更新；不受约束的外部类名还可能触发不希望发生的类初始化或方法执行。配置驱动的扩展机制应限制可选实现、校验预期接口，并尽量通过接口调用完成后续业务。

## 八、总结

反射把运行时的类型结构变成可读取、可操作的对象，让通用工具能够处理编译时未知的类。使用时应先弄清查询范围，再确认权限与参数，最后正确处理目标异常。面试中能把这些步骤与注解、泛型和框架场景串起来，比单纯背诵几个 API 更有说服力。
