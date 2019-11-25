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
      //hasProto 表示 __proto__是否可以使用
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
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
 *  会给数据对象增加一个 __ob__ 属性，表示是一个观测对象
 * @param value: 要观测的数据，如 Vue中的 data 对象
 * @param asRootData： 一个布尔值，代表将要被观测的数据是否是根级数据
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
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
/**
 * @description: 该函数的核心就是 将数据对象的数据属性转换为访问器属性，即为数据对象的属性设置一对 getter/setter
 * @param obj：数据对象
 * @param key：键
 * @param val
 * @param customSetter
 * @param shallow
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 每个字段的 Dep 对象都被用来收集那些属于对应字段的依赖。
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
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  /*
  1. 上面判断中可以获取val的值，val本身可能也是一个对象，那么就需要继续调用observe(val) 函数观测该对象从而深度观测数据对象。当然可能 val 也不能通过上面的判断所以可能也没有值，为undefined，这就会导致深度观测无效
  2. shallow参数必须为假时，才会深度观测数据对象。在walk函数中调用defineReactive函数时没有传入该函数，所以默认就是深度观测。其实非深度观测的场景我们之前遇到过，
    即 initRender 函数中在 Vue 实例对象上定义 $attrs 属性和 $listeners 属性时就是非深度观测：
      defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true) // 最后一个参数 shallow 为 true
      defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
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
          __ob__: {a, dep, vmCount}
        }
        __ob__: {data, dep, vmCount}
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
      //第2件事，收集依赖
      if (Dep.target) {
        // 这里大家要明确一件事情，即 每一个数据字段都通过闭包引用着属于自己的 dep 常量
        //这句代码的执行就意味着依赖被收集了
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
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
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
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
