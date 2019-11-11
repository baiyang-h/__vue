/* @flow */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 * @description:
 *    选项覆盖策略是处理如何将父选项值和子选项值合并到最终值的函数
 *    config.optionMergeStrategies 是一个合并选项的策略对象，这个对象下包含很多函数，这些函数就可以认为是合并特定选项的策略。
 *    这样不同的选项使用不同的合并策略，如果你使用自定义选项，那么你也可以自定义该选项的合并策略，只需要在 Vue.config.optionMergeStrategies 对象上添加与自定义选项同名的函数就行。
 *    而这就是 Vue 文档中提过的全局配置：optionMergeStrategies。
 *      输入key，返回一个策略函数
 *
 */
const strats = config.optionMergeStrategies

/************************************** 选项 el、propsData 的合并策略 *******************************************/
/**
 * Options with restrictions
 * @description:非production环境    选项 el、propsData 的合并策略
 *    选项 el、propsData 的合并策略，在非生产环境下在strats策略对象上添加两个策略(两个属性)分别是 el 和 propsData，且这两个属性的值是一个函数
 *    return childVal === undefined ? parentVal : childVal
 */
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    /*
      如果没有vm这个参数，提示 el 选项或者 propsData 选项只能在使用 new 操作符创建实例的时候可用
      这说明了一个问题，即在策略函数中如果拿不到 vm 参数，那说明处理的是子组件选项
        能够得知 mergeOptions 是在实例化时调用(使用 new 操作符走 _init 方法)还是在继承时调用(Vue.extend)，
        而子组件的实现方式就是通过实例化子类完成的，子类又是通过 Vue.extend 创造出来的，所以我们就能通过对 vm 的判断而得知是否是子组件了

      所以最终的结论就是：如果策略函数中拿不到 vm 参数，那么处理的就是子组件的选项
     */
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/************************************** 选项 data 的合并策略, strats.data策略函数 *************************************************/

/**
 * Helper that recursively merges two data objects together.
 * @description:
 *    将to和from对象进行合并后的一个终极合并策略
 *    - 没有parentVal直接返回childVal
 *      - childVal中没有parentVal的属性，则将parentVal的属性和值混合到childVal上
 *      - childVal中有和parentVal同名的属性，判断值是否相同，如果不相同，判断是否值为一个纯对象，如果是，则继续调用mergeData函数，进行深度合并
 *    反正主要就是将parentVal混合到childVal上，如果childVal有同名属性值，以childVal优先，深度合并，对象里一层一层往下
 *  @param:
 *     to: childVal   是一个对象
 *     from: parentVal   是一个对象
 *  @return:
 *     返回一个基于childVal对象上修改后的一个对象
 */
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal

  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    // in case the object is already observed...
    if (key === '__ob__') continue
    toVal = to[key]
    fromVal = from[key]
    if (!hasOwn(to, key)) {
      //这个set方法就是Vue暴露出来的全局API Vue.set方法
      set(to, key, fromVal)
    } else if (
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 * @description:
 *    该函数的返回值就是 strats.data策略函数
 *    如果没有传入vm参数，则表示是子组件
 *    1. 如果是子组件的情况
 *      - 子类data不存在，就是父类的data
 *      - 子类data存在，父类data不存在，就是子类的data
 *      - 子类data存在、父类data存在，一个mergedDataFn函数
 *    2. 如果是非子组件的时候
 *      - data 函数为 mergedInstanceDataFn 函数

     结论：options.data 选项最终被处理为一个函数，这些函数的执行结果就是最终的数据对象。这是因为，通过函数返回数据对象，保证了每个组件实例都有一个唯一的数据副本，避免了组件间数据互相影响。不然组件之间都是同一个对象，会互相影响
     后面对Vue初始化数据状态的时候，就是通过执行 strats.data 函数来获取数据并对其进行处理的。
     疑问：我们知道在合并阶段 strats.data 将被处理成一个函数，但是这个函数并没有被执行，而是到了后面初始化的阶段才执行的，这个时候才会调用 mergeData 对数据进行合并处理，那这么做的目的是什么呢？
     其实这么做是有原因的，后面讲到 Vue 的初始化的时候，大家就会发现 inject 和 props 这两个选项的初始化是先于 data 选项的，这就保证了我们能够使用 props 初始化 在data 中
     - 1. 由于 props 的初始化先于 data 选项的初始化
     - 2. data 选项是在初始化的时候才求值的，你也可以理解为在初始化的时候才使用 mergeData 进行数据合并。
 */
export function mergeDataOrFn (
  parentVal: any,       //传入parent的是data属性，即Vue.options.data值
  childVal: any,        //传入child的是data属性   即new Vue({}) options参数中传入的data值
  vm?: Component
): ?Function {
  if (!vm) {    //没有传入vm参数，处理的是子组件选项
    // in a Vue.extend merge, both should be functions
    //选项是在调用 Vue.extend 函数时进行合并处理的，此时父子 data 选项都应该是函数
    //再次说明了，当拿不到 vm 这个参数的时候，合并操作是在 Vue.extend 中进行的，也就是在处理子组件的选项
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    //childVal和parentVal都为true时，即父组件的data有值和子组件的data都有值时，返回该函数
    return function mergedDataFn () {
      //我们知道 childVal 要么是子组件的选项，即构造者.options.data，要么是使用 new 操作符创建实例时的选项，即实例.data，无论是哪一种，总之 childVal 要么是函数，要么就是一个纯对象
      //所以如果是函数的话就通过执行该函数从而获取到一个纯对象
      //所以mergeData函数的两个参数就是两个纯对象
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {    //处理非子组件选项的情况，也就是使用 new 操作符创建实例时的情况。将构造者.options.data和传入的{}.data合并
    return function mergedInstanceDataFn () {
      // instance merge
      //这两个常量最后都是一个对象
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      //如果实例属性data存在就将实例data属性和构造者.options.data合并，否则直接返回构造者.options.data。返回的都是一个将data函数处理后的一个data对象
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

/**
 * @description: 在 strats 策略对象上添加 data 策略函数，用来合并处理 data 选项
 *
 */
strats.data = function (
  parentVal: any,     //传入的是data属性
  childVal: any,
  vm?: Component
): ?Function {
  //我们知道当没有 vm 参数时，说明处理的是子组件的选项
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {  //首先判断是否传递了子组件的 data 选项，并且检测 childVal 的类型是不是 function
      // 子组件中的 data 必须是一个返回对象的函数
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    //如果 childVal 是函数类型，返回--------mergeDataOrFn方法返回的永远是一个函数
    return mergeDataOrFn(parentVal, childVal)   //注意没有传vm，  子组件
  }
  // 处理的选项不是子组件的选项--------mergeDataOrFn方法返回的永远是一个函数
  return mergeDataOrFn(parentVal, childVal, vm)   //注意传了vm， 不是子组件
}


/*********************************************** 生命周期钩子选项的合并策略 ***************************************************/
/**
 * Hooks and props are merged as arrays.
 * 生命周期钩子选项合并策略最后会返回一个数组：
 *    1. [生命周期函数, 生命周期函数, 生命周期函数...] 都是相同的生命周期
 *    2. 当parentVal和childVal都没有生命周期钩子时，返回undefined，根本不会执行
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
  return res
    ? dedupeHooks(res)    //删除重复的函数
    : res
  /*
    解释：
    res = (是否有 childVal，即判断组件的选项中是否有对应名字的生命周期钩子函数)
        ? 如果有 childVal 则判断是否有 parentVal
          ? 如果有 parentVal 则使用 concat 方法将二者合并为一个数组
          : 如果没有 parentVal 则判断 childVal 是不是一个数组
            ? 如果 childVal 是一个数组则直接返回
            : 否则将其作为数组的元素，然后返回数组
        : 如果没有 childVal 则直接返回 parentVal

    这里有个问题：parentVal 一定是数组吗？答案是：如果有 parentVal 那么其一定是数组，如果没有 parentVal 那么 strats[hooks] 函数根本不会执行。
                                              因为Vue.extend 函数内部的 mergeOptions 处理，生命周期合并策略中 还是会执行上面mergeHook函数中的，Array.isArray(childVal) ? childVal : [childVal]
                                              所以返回的一定是一个数组
    例子1：
      new Vue({
        created: function () {
          console.log('created')
        }
      })
      childVal：就是例子中的created，parentVal：Vue.options.created，但是不存在
      最终返回：
      options.created = [
        function () {
          console.log('created')
        }
      ]
    例子2：
      const Parent = Vue.extend({
        created: function () {
          console.log('parentVal')
        }
      })
      const Child = new Parent({
        created: function () {
          console.log('childVal')
        }
      })
      childVal：
        created: function () {
          console.log('childVal')
        }
      parentVal：
        Parent.options.created = [
          created: function () {
            console.log('parentVal')
          }
        ]
      结果：
        [
          created: function () {
            console.log('parentVal')
          },
          created: function () {
            console.log('childVal')
          }
        ]

      另外 childVal 还可以是数组，这说明什么？说明了生命周期钩子是可以写成数组的，虽然 Vue 的文档里没有
   */
}
//用于删除重复的函数，返回的还是一个钩子函数的数组，只是对hooks做了重复处理
function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}
/*
  LIFECYCLE_HOOKS = ['beforeCreate', 'created', 'beforeMount', 'mounted', 'beforeUpdate', 'updated', 'beforeDestroy', 'destroyed', 'activated', 'deactivated', 'errorCaptured', 'serverPrefetch']
  即所有的生命周期名字
  该forEach就是在strats上增加所有生命周期的合并策略
 */
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/************************************************** 资源(assets)选项的合并策略 （directives、filters、components） ******************************************************/
/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 *
 * @description: 对components、directives、filters进行合并
 * @return 返回一个对象
 *    如果childVal对象存在，返回一个有childVal属性的对象，该对象的原型对象是parentVal对象
 *    如果不存在childVal对象，则返回一个空对象，不过原型对象是parentVal对象
      如：
      childVal为：
        components: {
          ChildComponent: ChildComponent
        }

      parentVal为：
        Vue.options = {
          components: {
            KeepAlive,
            Transition,
            TransitionGroup
          },
          directives: Object.create(null),
          directives:{
            model,
            show
          },
          filters: Object.create(null),
          _base: Vue
        }
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  /*
    //parentVal对象即：
    components: {
      KeepAlive,
      Transition,
      TransitionGroup
    }
   */
  const res = Object.create(parentVal || null)
  if (childVal) {
    // 这个函数其实是用来检测 childVal 是不是一个纯对象的，如果不是纯对象会给你一个警告
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    //将childVal对象上的属性混合到res对象上
    return extend(res, childVal)      //{}空对象，混入childVal对象上的属性，.__proto__上是parentVal对象的属性
    /*
      结果：
      res = {
        ChildComponent  //childVal对象中组件
        // 原型
        __proto__: {
          KeepAlive,
          Transition,
          TransitionGroup
        }
      }
    */
  } else {
    return res
  }
}
//ASSET_TYPES = ['component', 'directive', 'filter']
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/********************************************* 选项 watch 的合并策略 *****************************************************/
/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 * @description:
     该函数最终返回一个对象，该对象的结构有以下3种：
     1. 无childVal时:  此处有原型是返回的这个对象，我们可以通过原型链区继承他父级的属性，即父watch上的属性
        { __proto__: parentVal } 或者 {}
     2. 无parentVal时:
        返回childVal对象，即可能为： 值有可能是函数、数组、对象，反正返回childVal对象
        {
          key1: function(val) {},
          key2: [...],
          key3: {...}
        }
     3. 有childVal和parentVal时:
          - childVal和parentVal拥有相同key时，一起混合成一个数组 [ parentVal[key], childVal[key] ]返回。
          - childVal的key不在parentVal中时，直接返回[ childVal[key] ]
        返回一个对象，键为监听key，值为一个数组,数组中可能是函数、数组、对象
         {
            key1: [x, x, ...],
            key2: [x, ...],
            ...
         }
    @return:
      返回的是一个对象，用于绑定到options.watch上
 */
strats.watch = function (
  parentVal: ?Object,   //构造者的options属性对象中的watch属性，如Vue.options.watch，或const P = Vue.extend({}), P.options.watch
  childVal: ?Object,    //当前实例传的参数，如new Vue(options)中的对象options.watch，或Vue.extend(options)中的对象options.watch
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  /*
    在 Firefox 浏览器中 Object.prototype 拥有原生的 watch 函数,
    nativeWatch = ({}).watch, 所以先看nativeWatch是否有watch属性，如果有，并且parentVal和childVal都没写watch属性，那么会去Object.prototype上获取原生的watch，此时parentVal === nativeWatch成立，
    所以下面两句代码的目的是一个变通方案，当发现组件选项是浏览器原生的 watch 时，那说明用户并没有提供 Vue 的 watch 选项，直接重置为 undefined
   */
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    // 这个函数其实是用来检测 childVal 是不是一个纯对象的，如果不是纯对象会给你一个警告
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  /*** 此时 parentVal 以及 childVal 都将存在，那么就需要做合并处理了 ***/
  const ret = {}
  // 将 parentVal 的属性混合到 ret 中，后面处理的都将是 ret 对象，最后返回的也是 ret 对象
  extend(ret, parentVal)
  //这个循环的目的是：检查子选项中的key键在父选项中是否也存在，并且也有值。如果在的话将父子选项合并到一个数组，否则直接把子选项变成一个数组返回。
  for (const key in childVal) {
    // 由于遍历的是 childVal，所以 key 是子选项的 key，父选项中未必能获取到值，所以 parent 未必有值
    let parent = ret[key]
    const child = childVal[key]
    // 这个 if 分支的作用就是如果 parent 存在，就将其转为数组
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)  // 最后，如果 parent 存在，此时的 parent 应该已经被转为数组了，所以直接将 child concat 进去
      : Array.isArray(child) ? child : [child]  // 如果 parent 不存在，直接将 child 转为数组返回
  }
  //返回一个对象，value为一个数组
  return ret
}

/********************************************* 选项 props、methods、inject、computed 的合并策略 *****************************************************/
/**
 * Other object hashes.
 * @return: 返回一个对象，根据有无parentVal、childVal来返回一个对象
     1. 无parentVal，返回childVal
     2. 有parentVal，无childVal，返回深拷贝parentVal对象后的一个对象
     3. 有parentVal、有childVal，返回混合过的对象。 注意：childVal 将覆盖 parentVal 的同名属性，即父子选项中有相同的键，那么子选项会把父选项覆盖掉。
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    //props、methods、inject、computed，最后做过处理、规范化后，传进来都是一个对象，这里就是判断是否是一个纯对象，如果不是给出警告
    assertObjectType(key, childVal, vm)
  }
  //无parentVal，则输出childVal
  if (!parentVal) return childVal
  /*
    有parentVal，且有childVal，则输出混合过的一个对象，注意：childVal 将覆盖 parentVal 的同名属性，即父子选项中有相同的键，那么子选项会把父选项覆盖掉。
    有parentVal，无childVal，则输出一个深拷贝过后的parentVal对象
   */
  const ret = Object.create(null)  //创建一个纯粹的空对象，没有各种原型链
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}

/********************************************* 选项 provide 的合并策略 *****************************************************/
//provide 选项的合并策略与 data 选项的合并策略相同。返回一个函数，需要初始化后，执行函数后，返回一个对象
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 * 默认的策略: 只要子选项不是 undefined 那么就是用子选项，否则使用父选项
 */
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 */
/*
 * @description:
 *    这个方法是用来校验组件的名字是否符合要求
 *    1. 组件的名字要满足正则表达式：/^[a-zA-Z][\w-]*$/   Vue 限定组件的名字由普通的字符和中横线(-)组成，且必须以字母开头
 *    2. 用来检测你所注册的组件是否是内置的标签, 检测是否是保留标签
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}
export function validateComponentName (name: string) {
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 * 转为对象写法
 * 最后输出的规范化格式为
    props: ["someData"]
    规范化为：
    props: {
      someData:{
        type: null
      }
    }

     props: {
      someData1: Number,
      someData2: {
        type: String,
        default: ''
      }
    }
    规范化为
   props: {
    someData1: {
      type: Number
    },
    someData2: {
      type: String,
      default: ''
    }
  }
 */
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 * 转为对象写法
 * 最后输出的规范化格式为
 inject: {
  'data1': { from: 'data1' },
  'd2': { from: 'data2' },
  'data3': { from: 'data3', someProperty: 'someValue' }
 }
 */
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return
  const normalized = options.inject = {}
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 平时有对象和函数两种写法
 directives: {
    test1: {
      bind: function () {
        console.log('v-test1')
      }
    },
    test2: function () {
      console.log('v-test2')
    }
  }
 最后是将函数写法规范为对象的写法，可以把使用函数语法注册指令的方式理解为一种简写
 */
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 * @description:
 *    合并两个选项对象为一个新的对象, 这个函数在实例化和继承的时候都有用到
 *    1. 这个函数将会产生一个新的对象
 *    2. 这个函数不仅仅在实例化对象(即_init方法中)的时候用到，在继承(Vue.extend)中也有用到，所以这个函数应该是一个用来合并两个选项对象为一个新对象的通用程序
 * @params:
 *    parent: Vue.options
 *    child: 为new Vue({})传入的对象，options
 *    vm: 为实例对象
 * @return:
 *    将会产生一个新的对象
 */
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    /*
     * 这个方法是用来校验组件的名字是否符合要求
     * 1. 组件的名字要满足正则表达式：/^[a-zA-Z][\w-]*$/   Vue 限定组件的名字由普通的字符和中横线(-)组成，且必须以字母开头
     * 2. 用来检测你所注册的组件是否是内置的标签, 检测是否是保留标签
     */
    checkComponents(child)
  }

  /**
   * child 即new Vue({})传入的{}对象，即options， child 参数除了是普通的选项对象外，还可以是一个函数
   * 那么在哪个函数上有options静态属性呢
   * 1. Vue
   * 2. 通过 Vue.extend 创造出来的子类也是拥有这个属性，即 P = Vue.extend({})
   */
  if (typeof child === 'function') {
    child = child.options       //构造者.options
  }

  /**
   * 以下三个函数的作用就是在内部都将其规范成同一种方式，这样在选项合并的时候就能够统一处理
   */
  //规范化props，props有数组的写法、对象的写法。这里就是内部规范统一
  normalizeProps(child, vm)
  //规范化inject，inject有数组的写法、对象的写法。这里就是内部规范统一
  normalizeInject(child, vm)
  //规范化 directives 选项, 因为有对象的写法和函数的写法，所以统一规范
  normalizeDirectives(child)

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  /**
   * @description:
   *    如果options，即new Vue传入的对象属性中存在extends或mixins，则对parent和extends 或 则对parent和mixins 进行合并，生成一个新的对象
   */
  if (!child._base) {
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  /**
   * @description: 开始真正的合并，parent为构造者.options
   *    合并options、处理options，将处理过的options返回
   */
  const options = {}
  let key
  /*
    假如parent就是
    Vue.options = {
      components: {
          KeepAlive,
          Transition,
          TransitionGroup
      },
      directives:{
          model,
          show
      },
      filters: Object.create(null),
      _base: Vue
    }
   */
  for (key in parent) {
    mergeField(key)
  }
  //如果 child 对象的键也在 parent 上出现，那么就不要再调用 mergeField 了, 因为在上一个 for in 循环中已经调用过了，这就避免了重复调用。
  for (key in child) {
    /**
     * @description:
     *    hasOwn 方法返回一个布尔值，就是对hasOwnProperty方法的一个封装，object1.hasOwnProperty('property1')，用于判断当前属性是否是该对象自己的属性，不是继承来的
     */
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }

  function mergeField (key) {
    //strats = config.optionMergeStrategies  是一个合并选项的策略对象
    //defaultStrat 当一个选项不需要特殊处理的时候就使用默认的合并策略：只要子选项不是 undefined 那么就是用子选项，否则使用父选项。即：这里是如果childVal为undefined，则使用ParentVal，否则返回childVal
    //strats.el 和 strats.propsData 这两个策略函数是只有在非生产环境才有, 所以在生产环境将直接使用默认的策略函数 defaultStrat 来处理 el 和 propsData 这两个选项
    const strat = strats[key] || defaultStrat
    //经过分析，得出，只要key是data属性，处理过后他返回的永远是一个函数
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
