/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

/*
vm._vnode = null
vm._staticTrees = null

vm.$vnode
vm.$slots
vm.$scopedSlots

vm._c
vm.$createElement

vm.$attrs
vm.$listeners
 */
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees

  /*
  这一部分主要讲 Vue 是如何解析并处理 slot
  vm.$vnode
  vm.$slots
  vm.$scopedSlots
   */
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  const renderContext = parentVnode && parentVnode.context
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject

  /*
    这两行代码在 Vue 实例对象上添加了两个方法，这两个方法实际上是对内部函数 createElement 的包装。这两个方法就第六个参数不同，一个true，一个false
    vm._c                   //用于编译器根据模板字符串生成的渲染函数
    vm.$createElement       //用于render渲染函数，虽然看起来好像是一个暴露的方法，但其实文档中并没有
        渲染函数中这么写， 其实也可以直接用 this.$createElement
        render: function (createElement) {
          return createElement('h2', 'Title')
        }
        等价
        render: function () {
          return this.$createElement('h2', 'Title')
        }
   */
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  /*
    剩余的代码，主要就是在实例对象上定义两个属性：
    - vm.$attrs
    - vm.$listeners
   */
  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  /*
  我们注意到，在为实例对象定义 $attrs 属性和 $listeners 属性时，使用了 defineReactive 函数，
  该函数的作用就是为一个对象定义响应式的属性，所以 $attrs 和 $listeners 这两个属性是响应式的
   */
  if (process.env.NODE_ENV !== 'production') {
    /*
      这里还有一个对环境的判断，在非生产环境中调用defineReactive，传递的第四个参数是一个函数，
      实际上这个函数是一个自定义的 setter，这个 setter 会在你设置 $attrs 或 $listeners 属性时触发并执行,
      当 !isUpdatingChildComponent 成立时，会提示你 $attrs 是只读属性，isUpdatingChildComponent是一个变量，该变量来自于 lifecycle.js
     */
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance (vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    const { render, _parentVnode } = vm.$options

    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode
    // render self
    let vnode
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm
      // or previous vnode to prevent render error causing blank component
      /*
        vm.$options.render函数长怎么样子呢？
          1. render函数是我们手动自己写的，传进来
          2. 在传进来的options中没有写render属性，则：
                vm.$options.render = function () {
                  // 在下面方法中能看到 render 函数的 this 指向vm._renderProxy,
                  with(this){
                    return _c('div', [_v(_s(a))])   // 在这里访问 a，相当于访问 vm._renderProxy.a，因为环境是this环境
                  }
                }

              而vm._renderProxy在proxy.js文件中做了赋值，如果支持Proxy则 with 语句块内访问变量 将会被 Proxy 的 has 代理所拦截，否则为vm。一下两种可能
                - vm._renderProxy = new Proxy(vm, handlers)
                - vm._renderProxy = vm
       */
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`)
      // return error render result,
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null
    }
    // if the returned array contains only a single node, allow it
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }
    // set parent
    vnode.parent = _parentVnode
    return vnode
  }
}
