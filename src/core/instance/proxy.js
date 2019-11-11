/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'
/*
export function makeMap (
  str: string,
  expectsLowerCase?: boolean
): (key: string) => true | void {
  const map = Object.create(null)
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
}
 */

let initProxy

if (process.env.NODE_ENV !== 'production') {
  /*
    判断给定的 key 是否出现在下面字符串中定义的关键字中，这些关键字都是在 js 中可以全局访问的
    allowedGlobals = val => {
      Infinity: true,
      undefined: true,
      NaN: true,
      ......
    }
   */
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  )

  //一个警告函数⚠️，在渲染的时候引用了 key，但是在实例对象上并没有定义 key 这个属性或方法
  /*
    如以下：{{ a }} 没有定义在data上
    const vm = new Vue({
      el: '#app',
      template: '<div>{{a}}</div>',
      data: {
        test: 1
      }
    })
   */
  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals. ' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  //判断当前宿主环境是否支持原生 Proxy
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  //如果支持Proxy执行以下判断
  if (hasProxy) {
    /*
      isBuiltInModifier 函数用来检测是否是内置的修饰符
        isBuiltInModifier = val => {
          stop: true,
          prevent: true,
          self: true,
          ......
        }
     */
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    /*
      为 config.keyCodes 设置 set 代理，其目的是防止开发者在自定义键位别名的时候，覆盖了内置的修饰符
      比如: Vue.config.keyCodes.shift = 16
      如果不是内置的修饰符，则在config.keyCodes对象上增加新的修饰符键和值
     */
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  /**
   * @description:
   *  主要是判断对象是否具有某个属性时触发，如果不符合：key是vm实例的属性，或是js 中可以全局访问的关键字，或者是Vue中定义的以_开头的属性，如"_a"，则会警告报错。
   *  因为代理对象最后是vm._renderProxy，用于渲染时。比如{{ aaa }} 时，查看aaa该属性是否符合。
         - 只要key是vm的实例就返回true
         - 如果是不vm的实例
         - 是js 中可以全局访问的关键字，返回true
         - 不是js 中可以全局访问的关键字，符合（key是一个字符串，，并且，，key 是以下划线 _ 开头的字符串，，并且，，key不在$data内，则为真），则返回true。即就是Vue中定义的 _a、_c 等属性。
         - 否则返回false
         说的简单点，大概应该是：
         - key是vm的实例就返回true
         - 是js 中可以全局访问的关键字，返回true
         - key是Vue中定义的，如 _a、_b、_c 这些属性，则返回true
         - 否则，返回false
   */
  const hasHandler = {
    has (target, key) {
      const has = key in target
      //allowedGlobals函数：判断给定的 key 是否出现在定义的关键字中
      //warnReservedPrefix警告函数：在渲染的时候引用了 key，但是在实例对象上并没有定义 key 这个属性或方法时警告

      // 如果 key 在 allowedGlobals 之内，，或者，， （key是一个字符串，，并且，，key 是以下划线 _ 开头的字符串，，并且，，key不在$data内，则为真）
      const isAllowed = allowedGlobals(key) ||
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))
      /*
        如果 has 和 isAllowed 都为假，警告
        - !has 我们可以理解为你访问了一个没有定义在实例对象上(或原型链上)的属性，即{{ x }} x属性不在vm中
        - !isAllowed  1. 首先不是全局关键字，2. 只要满足 key不是一个字符串，或key不是以_开头的字符串，或key在$data中，符合其中一个条件就执行
        总结：也就是说当你访问了一个虽然不在实例对象上(或原型链上)的属性，但如果你访问的是全局对象那么也是被允许的（例如Number()这种就是全局对象）。
          即（例如）：key是vm实例的属性，或是js 中可以全局访问的关键字，或者是Vue中定义的以_开头的属性，如"_a"，才不会被警告，直接 return has || !isAllowed

            如：这样我们就可以在模板中使用全局对象了：Number是一个全局对象
            <template>
              {{Number(b) + 2}}
            </template>
            除了允许使用全局对象之外，还允许以 _ 开头的属性
       */
      if (!has && !isAllowed) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      //返回一个Boolean
      return has || !isAllowed
    }
  }

  //最终实现的效果无非就是检测到访问的属性不存在就给你一个警告, 而且该函数只在测试的时候会出现，除非手动设置vm.$options.render._withStripped = true
  //存在的话，返回该key的值
  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  /**
   * @description: 就是设置渲染函数的作用域代理，其目的是为我们提供更好的提示信息
   * 在这里初始化 initProxy，给vm实例增加了_renderProxy属性。
   *    - 如果发现支持 Proxy，则 vm._renderProxy = new Proxy(vm, handlers)， 这个代理的作用就是为了在开发阶段给我们一个友好而准确的提示
   *    - 否则 vm._renderProxy = vm
   */
  initProxy = function initProxy (vm) {
    //对于 hasProxy 顾名思义，这是用来判断宿主环境是否支持 js 原生的 Proxy 特性的，
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      //options.render._withStripped 这个属性只在测试代码中出现过, 所以一般情况下这个条件都会为假
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

export { initProxy }
