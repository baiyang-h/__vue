/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};
/*
假如我们定义了如下组件：
{
  name: 'someComp',
  props: {
    prop1: String
  }
}
<some-comp prop1="str" />

// props 的名字
key = 'prop1'
// props 选项参数
propOptions = {
  prop1: {
    type: String
  }
}
// props 数据
propsData = {
  prop1: 'str'
}
// 组件实例对象
vm = vm
 */
export function validateProp (
  key: string,             //prop的名字
  propOptions: Object,    //整个 props 选项对象
  propsData: Object,      //整个 props 数据来源对象, 用于存储外界传进来得值
  vm?: Component          //组件实例对象
): any {
  const prop = propOptions[key]
  //bsent，它是一个布尔值，代表着对应的 prop 在 propsData 上是否有数据，或者换句话说外界是否传递了该 prop 给组件。如果 absent 为真，则代表 prop 数据缺失。
  const absent = !hasOwn(propsData, key)
  // value 是一个变量，它的值是通过读取 propsData 得到的，当然了如果外界没有向组件传递相应的 prop 数据，那么 value 就是 undefined。
  let value = propsData[key]
  // boolean casting
  /*
  getTypeIndex 函数的作用准确地说是用来查找第一个参数所指定的类型构造函数是否存在于第二个参数所指定的类型构造函数数组中，没错第二个参数可能是一个数组
  比如我们像如下这样定义 props：
  props: {
    prop1: [Number, String]
  }
  那么经过规范化后 propOptions 将是：
  propOptions = {
    prop1: {
      type: [Number, String]
    }
  }
   */
  // 以下booleanIndex这个判断，这段代码的作用实际上是对 prop 的类型为布尔值时的特殊处理
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // 也就是说常量 booleanIndex 的值如果大于 -1，说明在定义 props 时指定了 Boolean 类型。
  if (booleanIndex > -1) {
    // 外界没有为组件传递该 prop，并且该 prop 也没有指定默认值。在这种情况下如果你指定该 prop 的类型为 Boolean，那么 Vue 会自动将该 prop 的值设置为 false
    if (absent && !hasOwn(prop, 'default')) {
      value = false

      /*
      外界向组件传递的 prop 要么是一个空字符串，要么就是一个名字由驼峰转连字符后与值为相同字符串的 prop
      <!-- 值为空字符串 -->
      <some-comp prop1="" />
      <!-- 名字由驼峰转连字符后与值为相同字符串 -->
      <some-comp someProp="some-prop" />
       */
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 如果 stringIndex < 0 则说明没有为该 prop 指定 String 类型，否则说明为 prop 指定了 String 类型
      const stringIndex = getTypeIndex(String, prop.type)
      /*
      1. 没有定义 String 类型    如果定义了外界prop，直接返回true
      2. 虽然定义了 String 类型，但是 String 类型的优先级没有 Boolean 高。      即type: [ Boolean, Stirng ]
      <!-- 值为空字符串 -->
      <some-comp prop1="" />
      <!-- 名字由驼峰转连字符后与值为相同字符串 -->
      <some-comp someProp="some-prop" />

      {
        name: 'someComp',
        props: {
          prop1: {
            type: [Boolean, String]       //浙江即使prop1传入字符串，也是返回true
          }
        }
      }

      <some-comp prop1="" />
      <!-- 等价于 -->
      <some-comp prop1 />

       */
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // check default value
  // 当外部没有传入prop时，value===undefined，我们走当前组件内props中设定的默认值default
  if (value === undefined) {
    // 获取props中该prop设定的default默认值
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    //将开关开启，使得 observe 函数能够将 value 定义为响应式数据，最后又还原了 shouldObserve 的状态。之所以这么做是因为取到的默认值是非响应式的，我们需要将其重新定义为响应式数据。
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    //真正的校验工作是在 assertProp 函数中
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default

  // warn against non-factory defaults for Object & Array
  // 在非生产环境下，如果你的 prop 默认值是对象类型，那么则会打印警告信息，告诉你需要用一个工厂函数返回这个对象类型的默认值
  // 这么做的目的是防止多个组件实例共享一份数据所造成的问题。
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  /*
  1、当前组件处于更新状态，且没有传递该 prop 数据给组件
  2、上一次更新或创建时外界也没有向组件传递该 prop 数据
  3、上一次组件更新或创建时该 prop 拥有一个不为 undefined 的默认值

  主要是用于避免触发无意义的响应

    由于 prop1 的默认值是由工厂函数返回的对象，这个对象每次都是不同的，即使看上去数据是一样的，但他们具有不同的引用，这样每次都会触发响应，但视图并没有任何变化，也就是说触发了没有意义的响应。
  而解决办法就是前面所介绍的，返回上一次的默认值就可以了。
   */
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp (
  prop: PropOptions,      //  为该prop的定义对象
  name: string,           // 是该 prop 的名字
  value: any,             // 是该 prop 的值
  vm: ?Component,
  absent: boolean         // 为一个布尔值代表外界是否向组件传递了该 prop 数据
) {
  //prop 为必传 prop，但是外界却没有向组件传递该 prop 的值, 打印警告
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  // value 值为 null 或 undefined，并且该 prop 是非必须的，在这种情况下就不需要做后续的校验了
  if (value == null && !prop.required) {
    return
  }
  /*
  这段代码的作用是用来做类型断言的，即判断外界传递的 prop 值的类型与期望的类型是否相符
   */
  //!type 说明如果开发者在定义 prop 时没有规定该 prop 值的类型，则不需要校验,所以外界传入什么类型都没关系。或者干脆在定义 prop 时直接将类型设置为 true，也代表不需要做 prop 校验。
  let type = prop.type
  let valid = !type || type === true
  // 该常量用来保存类型的字符串表示
  const expectedTypes = []
  if (type) {
    // 检测 type 是否是一个数组，如果不是数组则将其包装成一个数组。最后type都是变为[Number, String, Object···]
    if (!Array.isArray(type)) {
      type = [type]
    }
    //一旦某个类型校验通过，那么 valid 的值将变为真，此时 for 循环内的语句将不再执行，这是因为该 prop 值的类型只要满足期望类型中的一个即可
    for (let i = 0; i < type.length && !valid; i++) {
      /*
      真正的类型断言是由 assertType 函数来完成的, assertType 函数的返回值是一个如下结构的对象
      {
        expectedType: 'String',         expectedType 属性就是类型的字符串表示
        valid: true                     valid 属性是一个布尔值，它的真假代表了该 prop 值是否通过了校验
      }
       */
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }
//valid true通过校验，false未通过。假设 for 循环遍历结束之后 valid 变量依然为假，则说明该 prop 值的类型不在期望的类型之中
  if (!valid) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  // prop 时可以通过 validator 属性指定一个校验函数实现自定义校验，该函数的返回值作为校验的结果
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  //getType 函数获取到的类型字符串表示
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    /*
    1、期望的类型是这五种类型之一：'String'、'Number'、'Boolean'、'Function' 以及 'Symbol'
    2、并且通过 typeof 操作符取到的该 prop 值的类型为 object
    const str = new String('基本包装类型'),通过 typeof 获取 str 的类型将得到 'object' 字符串。但 str 的的确确是一个字符串
     */
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    //isPlainObject 判断给定变量是否是纯对象
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    // 自定义类型
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable (value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
