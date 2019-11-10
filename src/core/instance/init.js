/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    /**
     * @description:组件初始化的性能追踪
     *    每次实例化一个对象，就对该对象添加一个_uid属性，uid++，进行计数
     */
    vm._uid = uid++

    /**
     * @description:
     *    组件初始化的性能追踪
     */
    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    /**
     * @description:
     *    代表该对象是 Vue 实例
     */
    vm._isVue = true

    // merge options
    //options 就是我们调用 Vue 时传递的参数选项
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      /**
       * @description:
       *    在 Vue 实例上添加了 $options 属性, 这个属性用于当前 Vue 的初始化
       *    mergeOptions函数用于 选项的合并
       * @param: mergeOption函数的参数
       *    1. resolveConstructorOptions(vm.constructor): 获取构造者处理过的 options。vm.constructor存在两种可能，一种是直接Vue构造函数，一种是Vue.extend({})创建的构造函数
              1.1 如初始化传入的是Vue， 返回options = Vue.options
               Vue.options = {
                  components: {
                    KeepAlive
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
              1.2 传入Vue.extend({})构造函数返回 经过处理的options
                  xxxx -------------- 暂时没分析----------

            2. 就是我们调用 Vue 构造函数的透传进来的选项，如
               {
                  el: '#app',
                  data: {
                    test: 1
                  }
               }

            3. 第三个参数 vm 就是 Vue 实例对象本身
          //////////////////////////////////////
          对mergeOptions函数中的的分析得到：
            1. 非生产环境 校验组件的名字 是否符合规范（而且不是关键字、保留字）
            2. 因为Vue api中props、inject、directives存在多种写法，在源码中是处理成统一规范，方便处理
            3. 如果传入的options{}参数中存在extends、mixins，进行合并
            4. 处理合并成一个options，将构造函数上的options属性和传入的options参数合并成一个options,
                *并且对以下属性增加合并策略*
                - el、propsData的合并策略         //返回值childVal === undefined ? parentVal : childVal，即el、propsData的值
                - data的合并策略                 //返回函数，子组件和非子组件返回的函数不同，（该函数执行后都是一个合并过后的data对象，这要在初始化时执行）
                - 生命周期钩子选项的合并策略       //返回一个数组，数组内部是生命周期函数，[生命周期函数, 生命周期函数...]，如果parentVal和childVal都没有，则返回undefined，不存在生命周期合并策略，在options上不会有
                - 资源(assets)选项的合并策略      //directives、filters、components被认为是资源，因为都是可以作为第三方应用来提供的。
                - watch选项的合并策略
                - 对于 props、methods、inject、computed 选项的合并策略
                - provide的合并策略



                4. options.props、options.methods、options.inject、options.computed，返回一个对象，返回存在3种可能：
                   - 无parentVal，返回childVal
                   - 有parentVal，无childVal，返回深拷贝parentVal对象后的一个对象
                   - 有parentVal、有childVal，返回混合过的对象。注意：childVal 将覆盖 parentVal 的同名属性， 即父子选项中有相同的键，那么子选项会把父选项覆盖掉。

                5. options.provide，返回一个函数，函数执行的结构是返回一个对象，即就是data一样的函数
       */
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),  //Vue.options
        options || {},                        //Vue 构造函数的透传进来的选项
        vm                                          //Vue 实例对象本身
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    /**
     * 一系列的初始化方法 在这些初始化方法中，无一例外的都使用到了实例的 $options 属性
     */
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

/**
 * @description: 用来获取构造者的 options，即返回处理过的 构造者.options对象
 *    注意：Vue.extend 创造一个子类并使用子类创造实例时，那么 vm.constructor 就不是 Vue 构造函数，而是子类
 * @param Ctor: 传递进来的参数 vm.constructor，如是 Vue 构造函数
 * @return {*}
 */
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
