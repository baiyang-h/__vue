/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/**
 * @description: 对部分选项进行初始化，如：props、methods、data、computed 和 watch 等
 *    并且我们注意到 props 选项的初始化要早于 data 选项的初始化
 *    props > methods > data > computed > watch
 * @param vm
 */
export function initState (vm: Component) {
  //其初始值是一个数组，这个数组将用来存储所有该组件实例的 watcher 对象
  vm._watchers = []
  const opts = vm.$options
  //如果选项中有 props，那么就调用 initProps 初始化 props 选项
  if (opts.props) initProps(vm, opts.props)
  //如果 选项中 methods 存在，则调用 initMethods 初始化 methods 选项。
  if (opts.methods) initMethods(vm, opts.methods)
  /*
    判断 data 选项是否存在，如果存在则调用 initData 初始化 data 选项，如果不存在则直接调用 observe 函数观测一个空对象：{}，并且 vm._data 引用了该空对象。
    $data 属性是一个访问器属性，其代理的值就是 _data，具体设置就在下面的 stateMixin 函数中
   */
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  //如果选项中有 computed，那么就调用 initComputed 初始化 computed 选项
  if (opts.computed) initComputed(vm, opts.computed)
  //如果选项中有 watch && 还要判断 opts.watch 是不是原生的 watch 对象，是，那么就调用 initWatch 初始化 watch 选项
  //前面的章节中我们提到过，这是因为在 Firefox 中原生提供了 Object.prototype.watch 函数，避免这里没watch对象时，调用火狐中的watch属性
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

/**
 * @description
 *  1. 根据 vm.$options.data 选项获取真正想要的数据（注意：此时 vm.$options.data 是函数）
 *  2. 校验得到的数据是否是一个纯对象
 *  3. 检查数据对象 data 上的键是否与 props 对象上的键冲突
 *  4. 检查 methods 对象上的键是否与 data 对象上的键冲突
 *  5. 在 Vue 实例对象上添加代理访问数据对象的同名属性
 *  6. 最后调用 observe 函数开启响应式之路
 */
function initData (vm: Component) {
  let data = vm.$options.data   //在data合并策略中我们知道 vm.$options.data 其实最终被处理成了一个函数。函数的执行结果才是真正的数据，是一个对象
  /*
    既然我们知道 data 是一个函数了，为什么这里还要进行判断呢？
    这是因为 beforeCreate 生命周期钩子函数是在 mergeOptions 函数之后 initData 之前被调用的，
    如果在 beforeCreate 生命周期钩子函数中修改了 vm.$options.data 的值，那么在 initData 函数中对于 vm.$options.data 类型的判断就是必要的了
   */
  //经过getData这一步，此时 data 已经不是一个函数了，而是最终的数据对象
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)   //getData 函数获取真正的数据,
    : data || {}
  //isPlainObject 函数判断变量 data 是不是一个纯对象，这个判断语句之后，data已经是一个对象了
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    /*
    props优先级 > methods优先级 > data优先级
    即如果一个 key 在 props 中有定义了那么就不能在 data 和 methods 中出现了；如果一个 key 在 data 中出现了那么就不能在 methods 中出现了
     */
    if (process.env.NODE_ENV !== 'production') {
      //警告，事件和data具有相同key时，发出的警告。你定义在 methods 对象中的函数名称已经被作为 data 对象中某个数据字段的 key 了，你应该换一个函数名字
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    //警告，data和prop 具有相同key时的警告
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    }
    /*
    该条件的意思是判断定义在 data 中的 key 是否是保留键
    isReserved 函数通过判断一个字符串的第一个字符是不是 $ 或 _ 来决定其是否是保留的，
    Vue 是不会代理那些键名以 $ 或 _ 开头的字段的，因为 Vue 自身的属性和方法都是以 $ 或 _ 开头的，所以这么做是为了避免与 Vue 自身的属性和方法相冲突。
      如果 key 既不是以 $ 开头，又不是以 _ 开头，那么将执行 proxy 函数，实现实例对象的代理访问
     */
    else if (!isReserved(key)) {
      /*
        proxy 函数的原理是通过 Object.defineProperty 函数在实例对象 vm 上定义与 data 数据字段同名的访问器属性，并且这些属性代理的值是 vm._data 上对应属性的值。

        即：本来上面data的数据都在处理过的 vm._data 上，现在我们经过处理，将vm._data上的数据添加到 vm实例 上，所以 我们可以平时访问this.a得到数据了
        当我们访问this.a 其实是访问 this._data.a
        this._data.a --->  this.a
       */
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  /*
    调用 observe 函数将 data 数据对象转换成响应式
   */
  observe(data, true /* asRootData */)
}

/**
 * @description: 通过调用 data 函数获取真正的数据对象并返回
 * @param data选项，在data合并策略中知道，data选项是一个函数
 * @param Vue 实例对象
 */
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  /*
  开头调用了 pushTarget() 函数，结尾调用了 popTarget()。为了防止使用 props 数据初始化 data 数据时收集冗余的依赖
   */
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    // getter为 相应属性计算属性的函数
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // watchers的引用操作就是对vm._computedWatchers的操作
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions    //这个参数是一个配置对象， 这里是为了表示该观察者对象是计算属性的观察者
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 使用计算属性的名字检查组件实例对象上是否已经有了同名的定义，如果该名字已经定义在组件实例对象上，那么有可能是 data 数据或 props 数据或 methods 数据之一，对于 data 和 props 来讲他们是不允许被 computed 选项中的同名属性覆盖的
    if (!(key in vm)) {
      // 在组件实例对象上定义与计算属性同名的组件实例属性，而且是一个访问器属性
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// 在组件实例对象上定义与计算属性同名的组件实例属性，而且是一个访问器属性
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // shouldCache是一个布尔值，用来标识是否应该缓存值，也就是说只有在非服务端渲染的情况下计算属性才会缓存值。shouldCache为true
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    // 计算属性值为一个函数
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 计算属性值为一个对象
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  //其代理的值就是 _data 和 _props
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    //options.user 的值设置为 true,这代表该观察者实例是用户创建的
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // immediate 选项用来在属性或函数被侦听后立即执行回调
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
