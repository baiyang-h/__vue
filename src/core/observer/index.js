/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
/**
 * @description：真正将数据对象转换成响应式数据，构造函数
 *    该类的实例对象拥有三个实例属性：value、dep、vmCount
 *    以及两个实例方法：walk、observeArray

      1. 实例对象（定义了3个属性，两个方法）
          属性：
            1. this.value:        this.value = 传入的数据对象
            2. this.dep:          new Dep()
            3. this.vmCount:      this.vmCount = 0
          方法：
      2. 传入的数据对象（增加了__ob__属性）
          1. def()函数，给传入的数据对象增加了一个 __ob__属性： 数据对象.__ob__ = Observer的实例对象

 */
export class Observer {
  value: any;   //引用了数据对象
  dep: Dep;     //是一个收集依赖的“筐”
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {    //value: 传入的数据对象
    // 实例对象的 value 属性引用了数据对象
    this.value = value
    // Dep是什么呢？ 它就是一个收集依赖的“筐”
    this.dep = new Dep()
    this.vmCount = 0
    /*
    该函数的作用是： 为数据对象定义了一个 __ob__ 属性，这个属性的值就是当前 Observer 实例对象
    def 函数其实就是 Object.defineProperty 函数的简单封装，之所以这里使用这个额外的操作，是因为这里对Object.defineProperty中enumerable: !!enumerable,设置了不可枚举。
    这样后面遍历数据对象的时候就能够防止遍历到 __ob__ 属性。

    假设我们的数据对象，value就是数据对象，如下：
      const data = {
        a: 1
      }
      经过def函数之后：
        const data = {
          a: 1,
          // __ob__ 是不可枚举的属性
          __ob__: {
            value: data, // value 属性指向 data 数据对象本身，这是一个循环引用
            dep: dep实例对象, // new Dep()
            vmCount: 0
          }
        }
     */
    def(value, '__ob__', this)
    //数组和对象的处理方式是不一样的
    if (Array.isArray(value)) {   //value是数组时
/* 例子:
// 要拦截的数组变异方法
const mutationMethods = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

const arrayMethods = Object.create(Array.prototype) // 实现 arrayMethods.__proto__ === Array.prototype
const arrayProto = Array.prototype  // 缓存 Array.prototype

mutationMethods.forEach(method => {
  arrayMethods[method] = function (...args) {
    const result = arrayProto[method].apply(this, args)

    console.log(`执行了代理原型的 ${method} 函数`)

    return result
  }
})
---------------------------------  兼容__proto__情况
const arr = []
arr.__proto__ = arrayMethods
arr.push(1)
--------------------------------- 不兼容时
const arr = []
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

arrayKeys.forEach(method => {
  arr[method] = arrayMethods[method]
})
上面这种直接在数组实例上定义的属性是可枚举的，所以更好的做法是使用 Object.defineProperty：
arrayKeys.forEach(method => {
  Object.defineProperty(arr, method, {
    enumerable: false,
    writable: true,
    configurable: true,
    value: arrayMethods[method]
  })
})

下面要实现的就是类似功能
*/
      //hasProto 表示 __proto__是否可以使用。因为 __proto__ 属性是在 IE11+ 才开始支持
      /*
      无论是 protoAugment 函数还是 copyAugment 函数，他们的目的只有一个：把数组实例与代理原型或与代理原型中定义的函数联系起来，从而拦截数组变异方法。
      即 拦截了数组上原生的变异方法，在不改变原生方法的情况下，进行了重新修改数组的变异方法。 通过原型链或在实例对象上重新定义同名方法。
      这样当我们尝试通过这些变异方法修改数组时是会触发相应的依赖(观察者)的。
       */
      if (hasProto) {
        //结果是 value.__proto__ = arrayMethods
        //arrayMethods
        protoAugment(value, arrayMethods)
      } else {
        //allayKeys: ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse']
        copyAugment(value, arrayMethods, arrayKeys)
      }
      //递归，对于深层次的 数组进行 观测
      this.observeArray(value)
    } else {  //value是对象时
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      //搜集依赖
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    //使用 def 函数在数组实例上定义与数组变异方法同名的且不可枚举的函数,这样就实现了拦截操作
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
/**
 * @description: 观测对象的初始入口
 *  if 如果数据对象不是一个纯对象或者是vNode实例，则直接return undefined
 *  if 如果数据对象本身有 __ob__ 属性，并且该 __ob__属性的值是Observer的实例，则返回该值，value.__ob__
 *  if else 各种判断下面： 创建一个 ob Observer的实例对象，并且给数据对象value，增加一个__ob__属性，其值就是这个Observer的实例对象
 *  会给数据对象增加一个 __ob__ 属性，表示是一个观测对象，其值就是一个观察实例对象
 * @param value: 要观测的数据，如 Vue中的 data 对象
 * @param asRootData： 一个布尔值，代表将要被观测的数据是否是根级数据
 *    可以看到在调用 observe 观测 data 对象的时候 asRootData 参数为 true。而在后续的递归观测中调用 observe 的时候省略了 asRootData 参数。所以所谓的根数据对象就是 data 对象。
 * @returns {Observer|void}
     ob: {
        value: data, // value 属性指向 data 数据对象本身，这是一个循环引用
        dep: dep实例对象, // new Dep()
        vmCount: 0,
        __proto__: {
          walk函数,
          observeArray函数,
        }
     }
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  //用来判断要观测的数据不是一个 对象 或者是 VNode 实例，直接return
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  //定义变量 ob， 该变量用来保存 Observer 实例。 最后 observe 函数，就是返回ob实例。
  let ob: Observer | void
  //hasOwn 函数检测数据对象 value 自身是否含有 __ob__ 属性, 并且__ob__ 属性应该是 Observer 的实例
  // 其实当一个数据对象被观测之后将会在该对象上定义 __ob__ 属性，所以 if 分支的作用是用来避免重复观测一个数据对象。
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {    //数据对象是被观测的
    ob = value.__ob__
  } else if (   //数据对象上没有定义 __ob__ 属性,即没有被观测过， 只有当以下所有条件成立才会被观测。在这个判断中, 内部的 new Observer(value) 会给数据对象增加一个__ob__属性，表示被观测了
    /*
    1. shouldObserve一个布尔值: 我们可以把 shouldObserve 想象成一个开关，为 true 时说明打开了开关，此时可以对数据进行观测，为 false 时可以理解为关闭了开关，此时数据对象将不会被观测
    2. isServerRendering() 函数的返回值是一个布尔值，用来判断是否是服务端渲染。只有当不是服务端渲染的时候才会观测数据
    3. (Array.isArray(value) || isPlainObject(value))： 只有当数据对象是数组或纯对象的时候，才有必要对其进行观测。
    4. Object.isExtensible(value)： 要被观测的数据对象必须是可扩展的。一个普通的对象默认就是可扩展的
        以下三个方法都可以使得一个对象变得不可扩展：Object.preventExtensions()、Object.freeze() 以及 Object.seal()
    5. !value._isVue： 我们知道 Vue 实例对象拥有 _isVue 属性，所以这个条件用来避免 Vue 实例对象被观测
     */
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  //是根数据 即data才 true
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
/**
 * @description:
 *    该函数的核心就是 对属性进行深度观测
 *      1. 将数据对象的数据属性转换为访问器属性，即为数据对象的属性设置一对 getter/setter，
 *      2. 增加搜集依赖
 * @param obj：数据对象 如data
 * @param key：键       key
 * @param val
 * @param customSetter
 * @param shallow

例如：传入的数据对象为
obj: const data = {
  a: {
    b: 1,
    __ob__: {value, dep, vmCount}
  },
  __ob__: {value, dep, vmCount}
}
key: a
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 每个字段的 Dep 对象都被用来收集那些属于对应字段的依赖。  看下面，还有一个搜集依赖。对他们的用处，下面写了说明
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)    //获取该字段可能已有的属性描述对象，即{value: x, writable: x, enumerable: x, configurable: x}
  if (property && property.configurable === false) {  //判断该字段是否是可配置的，如果不可配置，直接 return
    return    //因为一个不可配置的属性是不能使用也没必要使用 Object.defineProperty 改变其属性定义的
  }

  // cater for pre-defined getter/setters
  /*
  保存了 property属性的描述对象的 get 和 set 函数
  一个对象的属性很可能已经是一个访问器属性了，所以该属性很可能已经存在 get 或 set 方法。
  由于接下来会使用 Object.defineProperty 函数重新定义属性的 setter/getter，这会导致属性原有的 set 和 get 方法被覆盖，
  所以要将属性原有的 setter/getter 缓存，并在重新定义的 set 和 get 方法中调用缓存的函数，从而做到不影响属性的原有读写操作。
   */
  const getter = property && property.get
  const setter = property && property.set
  //如果参数只有两个，即没有第3个参数val值，那么就要从数据对象上去获取这个值
  //getter存在，setter不存在，即对象有属于自己的getter时，false，下面那句observe返回undefined，那么这个属性就不会被深度观测
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  /*
  1. 上面判断中可以获取val的值，val本身可能也是一个对象，那么就需要继续调用observe(val) 函数观测该对象从而深度观测数据对象。当然可能 val 也不能通过上面的判断所以可能也没有值，为undefined，这就会导致深度观测无效
  2. shallow参数必须为假时，才会深度观测数据对象。在walk函数中调用defineReactive函数时没有传入该函数，所以默认就是深度观测。其实非深度观测的场景我们之前遇到过，
    即 initRender 函数中在 Vue 实例对象上定义 $attrs 属性和 $listeners 属性时就是非深度观测：
      defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true) // 最后一个参数 shallow 为 true
      defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)

  observe函数返回的值：
    数据不是一个 纯对象 或者是 VNode 实例，返回 undefined，即 data = { a: 111 }, val 是 data.a 是一个字符串，返回undefined
    或者
    data = {a: { __ob__: {xx} } }, val 是 data.a 是一个对象，返回 ob 观察实例对象
    返回 {
      value: data,      // value 属性指向 data 数据对象本身，这是一个循环引用
      dep: dep实例对象,  // new Dep()
      vmCount: number
      __proto__: {
        walk函数,
        observeArray函数
      }
    }
    即 childOb 就是 一个观察实例对象， 比如 data.a.__ob__，因为__ob__属性的值就是一个观察实例对象
    即：下面这句是对obj对象中深度观测，并且返回的是obj子属性，或者子对象的子属性，一直深度下去。的一个子对象的观察对象
  */
  let childOb = !shallow && observe(val)
  /*
  我们需要明确一件事，当一个数据对象经过observe函数处理之后变成了上面样子了
      const data = {
        a: {
          b: 1
        }
      }
      observe(data)

      const data = {
        // 属性 a 通过 setter/getter 通过闭包引用着 dep 和 childOb
        a: {
          // 属性 b 通过 setter/getter 通过闭包引用着 dep 和 childOb
          b: 1
          __ob__: {value: data.a, dep, vmCount}
        },
        __ob__: {value: data, dep, vmCount}
      }
    需要注意的是，属性 a 闭包引用的 childOb 实际上就是 data.a.__ob__。而属性 b 闭包引用的 childOb 是 undefined，因为属性 b 是基本类型值，并不是对象也不是数组。
   */
  //这里进行定义访问器属性
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    //这里 get 函数做了2件事：1. 正确地返回属性值、 2. 收集依赖
    get: function reactiveGetter () {
      //上面判断了getter是否存在的值，如果 getter 存在那么直接调用该函数，并以该函数的返回值作为属性的值，保证属性的原有读取操作正常运作。如果 getter 不存在则使用 val 作为属性的值。
      // 第1件事完成，正确返回属性值
      const value = getter ? getter.call(obj) : val
      //第2件事，收集依赖,
      //如果 Dep.target 存在的话说明有依赖需要被收集。如果 Dep.target 不存在就意味着没有需要被收集的依赖
      if (Dep.target) {  //Dep.target 中保存的值就是要被收集的依赖(观察者)，即 就像声明了一个变量一样，上面就是被搜集的依赖
        // 这里大家要明确一件事情，即 每一个数据字段都通过闭包引用着属于自己的 dep 常量
        //这句代码的执行就意味着依赖被收集了。执行 dep 对象的 depend 方法将依赖收集到 dep 这个“筐”中，即当前属性 a 自己的筐中
        dep.depend()  //搜集依赖
        if (childOb) {  //对象中没有对象，直接跳过 data = {a: 1, __ob__: {xx} }
          // childOb.dep === data.a.__ob__.dep
          // 这句话的执行说明除了要将依赖收集到属性 a 自己的“筐”里之外（搜集到a的框中的代码是上面 dep.depend 这句），还要将同样的依赖收集到 data.a.__ob__.dep 这里”筐“里
          childOb.dep.depend()  //搜集依赖
          /*
          为什么要将同样的依赖分别收集到这两个不同的”筐“里呢？答案就在于这两个”筐“里收集的依赖的触发时机是不同的，即作用不同
            - dep           data.a  这一级
              第一个”筐“里收集的依赖的触发时机是当属性值被修改时触发，即在 set 函数中触发：dep.notify()
            - childOb.dep   data.a.__ob__   这一级
              第二个”筐“里收集的依赖的触发时机是在使用 $set 或 Vue.set 给数据对象添加新属性时触发，
              我们知道由于 js 语言的限制，在没有 Proxy 之前 Vue 没办法拦截到给对象添加属性的操作。所以 Vue 才提供了 $set 和 Vue.set 等方法让我们有能力给对象添加新属性的同时触发依赖。
              那么触发依赖是怎么做到的呢？（对于对象中的对象），就是通过数据对象的 __ob__ 属性做到的，因为 __ob__.dep 这个”筐“里收集了与 dep 这个”筐“同样的依赖。

              Vue.set = function (obj, key, val) {
                defineReactive(obj, key, val)
                obj.__ob__.dep.notify() // 相当于 data.a.__ob__.dep.notify()
              }
              Vue.set(data.a, 'c', 1)

              所以 __ob__ 属性以及 __ob__.dep 的主要作用是为了添加、删除属性时有能力触发依赖
           */
          /*
          如果读取的属性值是数组，那么需要调用 dependArray 函数逐个触发数组每个元素的依赖收集,深度搜集。
          数组的搜集和对象的搜集方法不一样，结果一样。
          数组比较特别，因为数组的键是一个索引，不能被Object.defineProperty所监听。为了搜集依赖，这个时候dependArray就起作用了
          正是因为数组的索引不是”访问器属性“，所以当有观察者依赖数组的某一个元素时是触发不了这个元素的 get 函数的，当然也就收集不到依赖。这个时候就是 dependArray 函数发挥作用的时候了。
           */
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    // set 函数也要完成两个重要的事情： 1. 为属性设置新值，2. 触发相应的依赖，即当属性被修改的时候如何触发依赖。
    set: function reactiveSetter (newVal) {
      //取得属性原有的值。因为我们需要拿到原有的值与新的值作比较，并且只有在原有值与新设置的值不相等的情况下才需要触发依赖和重新设置属性值
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      /*
      newVal === value： 新值与旧值 比较
      (newVal !== newVal && value !== value)：newVal !== newVal 说明新值与新值自身都不全等，同时旧值与旧值自身也不全等。
          在 js 中什么时候会出现一个值与自身都不全等的？答案就是 NaN， 表示新旧值都是NaN，才会执行判断
      总结：新值与旧值相同，或者，新值和旧值都是NaN，才执行判断
       */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      //在非生产环境下，并且defineReactive函数中第4个参数有customSetter时，执行
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        /*
        在initRender.js文件中：
          defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
            !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
          }, true)
        所以，第4个参数就是customSetter，这里是一个箭头函数，用来打印辅助信息。
         */
        customSetter()
      }
      // #7981: for accessor properties without setter
      //getter存在，setter不存在，即对象有属于自己的getter时
      if (getter && !setter) return

      //以下就是调用原set函数的地方，从上面可知，setter 常量存储的是属性原有的 set 函数
      if (setter) {
        setter.call(obj, newVal)    //在这里调用原set函数
      } else {
        val = newVal
      }
      //赋了新值以后，该值是为被观测的，所以这里再进行观测。同时使用新的观测对象重写 childOb 的值
      // 这些操作都是在 !shallow 为真的情况下，即需要深度观测的时候才会执行。
      childOb = !shallow && observe(newVal)
      //我们知道 dep 是属性用来收集依赖的”筐“，现在我们需要把”筐“里的依赖都执行一下,而这就是 dep.notify() 的作用
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  //1. isUndef 函数用来判断一个值是否是 undefined 或 null，如果是则返回 true
  //2. isPrimitive函数用来判断一个值是否是原始类型值，如果是则返回 true。即：string、number、boolean以及 symbol。
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  //如果 target 是一个数组，并且 key 是一个有效的数组索引，则true
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  //如果 target 不是一个数组，那么必然就是纯对象了，当给一个纯对象设置属性的时候，假设该属性已经在对象上有定义了，那么只需要直接设置该属性的值即可，这将自动触发响应，因为已存在的属性是响应式的
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  // 代码运行到了这里，那说明正在给对象添加一个全新的属性
  const ob = (target: any).__ob__
  /*
  1. target._isVue：只有Vue实例对象上才有_isVue。
      所以：不能修改实例属性。
  2. 只有根数据对象的ob.vmCount才是>0, 为true。
      所以：所谓的根数据对象就是data。当使用 Vue.set/$set 函数为根数据对象添加属性时，是不被允许的。
   */
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // target 也许原本就是非响应的,此时直接赋值就可以了。比如随意一个对象用Vue.set方法增加属性
  if (!ob) {
    target[key] = val
    return val
  }
  // defineReactive 函数设置属性值，这是为了保证新添加的属性是响应式的
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
