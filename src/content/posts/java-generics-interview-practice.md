---
title: "Java 泛型面试与实战：从类型擦除到通配符的正确使用"
description: "结合集合、通用响应和数据复制等例子，理解 Java 泛型、类型擦除、通配符、PECS 原则及常见面试问题。"
pubDate: 2026-11-02
category: "Backend"
tags: ["Java", "Generics", "面试", "Backend"]
---

在 Java 项目中，`List<String>`、`Map<Long, User>` 和 `Result<User>` 都是泛型的常见用法。泛型让我们能在复用代码的同时，把更多类型错误提前暴露在编译阶段。但面试中，问题往往不会停留在“什么是泛型”：为什么 `List<Integer>` 不能赋值给 `List<Number>`？`? extends` 和 `? super` 怎么选？类型擦除后还能不能获取泛型信息？

本文以 Java 泛型为主题，从使用场景出发，梳理核心原理、实践方式和常见追问。示例使用 Java 8 及以上语法，省略必要的 import 和业务类定义。

## 一、泛型解决了什么问题

没有泛型时，集合可以存入各种对象，读取时需要手动转换：

```java
List values = new ArrayList(); // 原始类型，仅用于演示
values.add("Java");
values.add(123);
String value = (String) values.get(1); // 运行时 ClassCastException
```

使用泛型后，类型约束由编译器检查：

```java
List<String> values = new ArrayList<>();
values.add("Java");
// values.add(123); // 编译错误
String value = values.get(0); // 不需要手动强制转换
```

泛型的主要价值是**编译期类型检查和类型安全的代码复用**。不过，使用原始类型、未检查转换或反射等方式仍可能绕过编译器检查，泛型并不能消除所有运行时类型错误。

## 二、泛型类、接口和方法

### 1. 泛型类：统一接口响应

后端项目常用泛型封装统一响应结构，同时保留业务数据的具体类型：

```java
public class Result<T> {
    private final int code;
    private final String message;
    private final T data;

    private Result(int code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public static <T> Result<T> success(T data) {
        return new Result<>(0, "success", data);
    }

    public T getData() {
        return data;
    }
}
```

```java
Result<String> result = Result.success("操作成功");
String data = result.getData();
```

类上的 `T` 代表实例的数据类型；静态方法不能直接使用类的类型参数，所以 `success` 自己声明了 `<T>`。实际项目还可以根据序列化框架的要求补充构造器和访问方法。

### 2. 泛型接口：约定不同数据类型的处理方式

```java
public interface Converter<S, T> {
    T convert(S source);
}

public class UserConverter implements Converter<User, UserDto> {
    @Override
    public UserDto convert(User source) {
        return new UserDto(source.getId(), source.getName());
    }
}
```

接口定义转换的形状，实现类决定具体类型。`S`、`T` 只是常用命名，也可以使用更有意义的名称。

### 3. 泛型方法：让调用者决定类型

```java
public static <T> T firstOrNull(List<T> items) {
    return items.isEmpty() ? null : items.get(0);
}
```

`<T>` 声明方法的类型参数，返回值 `T` 和参数中的 `T` 表示同一种推断出的类型。方法的泛型参数属于该方法，即使所在的类不是泛型类也可以使用。

## 三、为什么 List<Integer> 不能赋值给 List<Number>？

虽然 `Integer` 是 `Number` 的子类，但 **`List<Integer>` 不是 `List<Number>` 的子类型**，Java 泛型在这里是不变的。假设允许赋值，就可能发生：

```java
List<Integer> integers = new ArrayList<>();
// 假设下面的赋值允许：
// List<Number> numbers = integers;
// numbers.add(3.14); // Double 被放入本应只存 Integer 的列表
```

这个限制防止通过 `numbers` 写入不属于 `Integer` 的值。如果方法只需要读取数字，就可以使用上界通配符：

```java
public static double sum(List<? extends Number> numbers) {
    double total = 0;
    for (Number number : numbers) {
        total += number.doubleValue();
    }
    return total;
}
```

该方法可以接收 `List<Integer>`、`List<Double>` 或 `List<Number>`，读取到的元素至少是 `Number`。

## 四、通配符和 PECS 原则

通配符表示某个未知类型，并不是说集合里可以随意混放各种类型。

| 写法 | 含义 | 安全读取 | 可以添加什么 |
| --- | --- | --- | --- |
| `List<?>` | 元素类型未知 | `Object` | 通常只能添加 `null` |
| `List<? extends Number>` | 元素是 `Number` 或其子类型的某一种 | `Number` | 通常只能添加 `null` |
| `List<? super Integer>` | 元素是 `Integer` 或其父类型的某一种 | `Object` | `Integer` 及其子类型，或 `null` |

这里的限制主要指通过该引用调用 `add`：例如，`? extends Number` 可能实际是 `List<Integer>`，也可能是 `List<Double>`，编译器无法安全地接收任意一个具体数字。

**PECS：Producer Extends，Consumer Super。** 数据来源使用 `extends`，数据接收方使用 `super`。例如把一组整数复制到一个可以接收整数的列表：

```java
public static void copyIntegers(List<? extends Integer> source,
                                List<? super Integer> target) {
    for (Integer value : source) {
        target.add(value);
    }
}
```

```java
List<Integer> source = Arrays.asList(1, 2, 3);
List<Number> target = new ArrayList<>();
copyIntegers(source, target);
```

如果需要让两个参数的元素类型相关联，可以使用类型参数：

```java
public static <T> void copy(List<? extends T> source, List<? super T> target) {
    for (T value : source) {
        target.add(value);
    }
}
```

PECS 是设计方法参数的指导，不是说 `extends` 引用绝对不能修改集合：例如 `clear()` 依然可能被调用，具体操作还取决于集合实现是否支持。

## 五、类型擦除：泛型在运行时发生了什么

Java 泛型主要通过**类型擦除**实现。编译器检查泛型约束后，通常会将类型参数替换为其上界；没有显式上界时使用 `Object`。必要时，编译器会插入类型转换来保持源码中的类型语义。

```java
List<String> names = new ArrayList<>();
names.add("Ada");
String name = names.get(0);
```

可以粗略理解为：运行时集合按擦除后的类型工作，取值处由编译器插入转换。`List<String>` 和 `List<Integer>` 的普通实例通常具有相同的运行时类，因此不能依靠实例的 `getClass()` 区分其元素类型。

擦除还带来几个常见限制：

- 不能直接写 `new T()` 或 `new T[10]`；因为运行时通常没有可直接用于创建实例或数组的具体 `T`。
- 不能写 `new List<String>[10]`，数组需要运行时元素类型信息，而参数化类型通常无法完整提供它。
- 不能仅凭 `List<String>` 和 `List<Integer>` 的参数区别重载方法：擦除后方法签名冲突。
- 不能直接使用 `List<int>`，需要用包装类型 `List<Integer>`。
- 不能写 `value instanceof List<String>` 来检查未知对象的元素类型；通常可以检查 `value instanceof List<?>`，但不能证明元素是字符串。

**擦除不意味着所有泛型信息都从字节码消失。** 字段、方法参数、返回值或父类的声明可能保留泛型签名，反射可以读取这些声明信息；但这不等于能从任意 `ArrayList` 实例恢复创建时的元素类型。

### 桥接方法是做什么的？

当子类指定泛型类型并重写方法时，擦除可能使父类和子类的方法签名不再一致。编译器可能生成一个**桥接方法**，在擦除后的方法调用与子类实现之间转发，以维持多态行为。排查反射结果或字节码时看到额外方法，不一定是自己写了重复代码。

## 六、实战：运行时需要类型信息怎么办？

如果方法需要创建对象或做运行时类型检查，可以显式传入 `Class<T>`：

```java
public static <T> T castValue(Object value, Class<T> type) {
    return type.cast(value);
}

String name = castValue("Ada", String.class);
```

`Class<T>` 能表达 `String.class` 这样的具体类，但无法直接表达 `List<String>.class`：`List.class` 只代表原始的 `List` 类。处理 JSON 等嵌套参数化类型时，应使用所选序列化库提供的类型描述机制，并按照该库版本的文档传递完整类型。

另一种常见做法是把创建逻辑交给调用方，避免在泛型方法里写 `new T()`：

```java
public static <T> T create(Supplier<T> factory) {
    return factory.get();
}

List<String> names = create(ArrayList::new);
```

这也让创建过程可以包含参数或使用其他工厂，而不要求类型必须有公开的无参构造器。

## 七、面试常见问题

**1. `T` 和 `?` 有什么区别？**

`T` 是具名类型参数，可以在方法的多个位置表达同一个类型之间的关系；`?` 是未知类型的通配符，适合描述“接受某种类型的集合”，不需要给这个未知类型命名。比如上面的 `copy` 用 `T` 把来源和目标关联起来。

**2. `List<Object>` 和 `List<?>` 一样吗？**

不一样。`List<Object>` 的元素类型明确为 `Object`，可以添加不同类型的对象；`List<?>` 的元素类型未知，可能指向 `List<String>`，因此不能随意添加对象。

**3. 泛型可以使用基本类型吗？**

类型参数不能直接使用 `int` 等基本类型，应使用 `Integer` 等包装类型。自动装箱和拆箱方便了使用，但需要留意包装对象、性能开销以及对 `null` 拆箱时可能发生的异常。

**4. 泛型和数组的类型规则一样吗？**

不一样。数组具有协变性，`String[]` 可以赋给 `Object[]`，但向其中放入不兼容对象时会在运行时抛出 `ArrayStoreException`；泛型集合是不变的，很多类似问题会在编译期被拒绝。

**5. 原始类型为什么不推荐？**

原始类型如 `List` 主要用于兼容旧代码，会削弱编译期类型检查并产生未检查警告。维护旧接口时应尽量在边界做类型校验，再逐步替换为明确的参数化类型；不要为了消除警告而随意使用 `@SuppressWarnings`。

## 八、总结

泛型的重点不是记住多少个尖括号，而是理解类型约束在哪一层生效：**编译期用类型参数保证协作关系，运行时需要的类型信息则要明确传入或从可用的声明元数据中读取。** 设计接口时，先判断数据是从参数中读出还是写入，再用 `extends`、`super` 或具名类型参数表达真实约束，代码就更容易复用和维护。

参考资料：[Java 泛型教程](https://docs.oracle.com/javase/tutorial/java/generics/)、[Java 语言规范：类型擦除](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.6)。
