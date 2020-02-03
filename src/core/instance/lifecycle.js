/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

//activeInstance这个变量将总是保存着当前正在渲染的实例的引用，所以它就是当前实例 components 下注册的子组件的父实例
export let activeInstance: any = null
/*
  定义 isUpdatingChildComponent，并初始化为 false。
  只有当 updateChildComponent 函数开始执行的时候会被更新为 true。当 updateChildComponent 执行结束时又将 isUpdatingChildComponent 的值还原为 false
  这是因为 updateChildComponent 函数需要更新实例对象的 $attrs 和 $listeners 属性，所以此时是不需要提示 $attrs 和 $listeners 是只读属性的
 */
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}

/**
 * @description: 与生命周期有关, 初始化
 *    主要做了：
 *    1. 定义vm.$parent、vm.$root、parent.$childrn中不存在抽象实例
 *      - 定义了 vm.$parent 指向父实例
 *      - 将当前实例添加到父实例的 $children 属性里 (父实例是跳过抽象实例的，一层层往上找，直到不是抽象实例为止，即抽象实例是不会被添加到父实例的$children中的)
 *      - 定义了 vm.$root
 *    2. 初始化 当前实例上添加一些属性
           vm.$children = []
           vm.$refs = {}

           vm._watcher = null
           vm._inactive = null
           vm._directInactive = false
           vm._isMounted = false
           vm._isDestroyed = false
           vm._isBeingDestroyed = false
 * @param 实例对象
 */
export function initLifecycle (vm: Component) {
  // 定义 options，它是 vm.$options 的引用，后面的代码使用的都是 options 常量
  const options = vm.$options

  // locate first non-abstract parent
  //>>>>>>>>
  /*
    下面这部分用一句话总结:
      - 将当前实例添加到父实例的 $children 属性里 (父实例是跳过抽象实例的，一层层往上找，直到不是抽象实例为止，即抽象实例是不会被添加到父实例的$children中的)
      - 定义了 vm.$parent 指向父实例
      - 定义了 vm.$root
   */
  // 定义 parent，它引用当前实例的父实例
  let parent = options.parent
  /*
    如果当前实例有父组件，且当前实例不是抽象的
      什么是抽象的实例？
      实际上 Vue 内部有一些选项是没有暴露给我们的，就比如这里的 abstract，通过设置这个选项为 true，可以指定该组件是抽象的，那么通过该组件创建的实例也都是抽象的。
      例如：
        AbsComponents = {
          abstract: true,
          created () {
            console.log('我是一个抽象的组件')
          }
        }
      抽象的组件有什么特点呢？
      1. 一般不渲染真实DOM
        如Vue内置的组件：keep-alive 或者 transition，这两个组件它是不会渲染DOM至页面的
          export default {
            name: 'keep-alive',
            abstract: true,
            ...
          }
      2. 它们不会出现在父子关系的路径上，抽象的组件是不能够也不应该作为父级的。 即： 即使keep-alive包裹着<AAA>，但<AAA>的父组件还是<BBB>，
        <BBB>
          <keep-alive><AAA></keep-alive>
        </BBB>
   */
  /*
    options.abstract为true，说表示当前实例是抽象
    下面这段主要做了：
      - 定义了vm.$parent
      - 定义了vm.$root
      - 如果遇到了抽象的实例，则跳过抽象实例，继续往上寻找，直到找到第一个父组件，并且在该 父组件的实例.$children.push(vm)
   */
  if (parent && !options.abstract) {    //存在父组件，且本身实例不是抽象的
    // 使用 while 循环查找第一个非抽象的父组件
    //一直往上寻找，直到找到第一个 非抽象的父组件，才跳出循环
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent     //当前实例还是抽象的，继续往上寻找
    }
    // 经过上面的 while 循环后，parent 应该是一个非抽象的组件，将它作为当前实例的父级，所以将当前实例 vm 添加到父级的 $children 属性里
    parent.$children.push(vm)     //  这里是 非抽象实例 被添加到父实例中， 如果是抽象实例，根本就不会进入这个判断，所以抽象实例不会被加入到父实例的$children中
  }

  // 设置当前实例的 $parent 属性，指向父级
  vm.$parent = parent
  // 设置 $root 属性，有父级就是用父级的 $root，否则 $root 指向自身
  vm.$root = parent ? parent.$root : vm
  //<<<<<<<

  //当前实例上添加一些属性
  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // initial render
      // vm.$el 的值将被 vm.__patch__ 函数的返回值重写
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

export function mountComponent (
  vm: Component,      //组件实例 vm
  el: ?Element,       //挂载元素 el,参数前进行了转换， 是一个dom
  hydrating?: boolean   //hydrating 是用于 Virtual DOM 的补丁算法的
): Component {
  //在组件实例对象上添加 $el 属性，其值为挂载元素 el。我们知道 $el 的值是组件模板根元素的引用，即我们使用 this.$el 得到根元素
  //此时的el还是data中的el属性或者$mount函数传进来的参数，但是后面会被重写。
/*
  <div id="foo"></div>
  <script>
  const new Vue({
    el: '#foo',
    template: '<div id="bar"></div>'
  })
  console.log(this.$el)   //其实是bar

  这是因为 vm.$el 始终是组件模板的根元素。由于我们传递了 template 选项指定了模板，那么 vm.$el 自然就是 id 为 bar 的 div 的引用。
  假设我们没有传递 template 选项，那么根据我们前面的分析，el 选项指定的挂载点将被作为组件模板，这个时候 vm.$el 则是 id 为 foo 的 div 元素的引用
  </script>
*/
  vm.$el = el

  if (!vm.$options.render) {
    // 如果不存在渲染函数，则声明 createEmptyVNode ，即仅仅渲染一个空的 vnode 对象
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 触发 beforeMount 生命周期钩子
  callHook(vm, 'beforeMount')

  /*
    这段代码的作用只有一个，即定义并初始化 updateComponent 函数，这个函数将用作创建 Watcher 实例时传递给 Watcher 构造函数的第二个参数
    最终其实都是执行 vm._update(vm._render(), hydrating)
      - vm._render 函数的作用是调用 vm.$options.render 函数并返回生成的虚拟节点(vnode)
      - vm._update 函数的作用是把 vm._render 函数生成的虚拟节点渲染成真正的 DOM

    执行完该段代码的时候，我们可以简单地认为 updateComponent 函数的作用就是：把渲染函数生成的虚拟DOM渲染成真正的DOM
      其实在 vm._update 内部是通过虚拟DOM的补丁算法(patch)来完成的
   */
  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`
      // 分别统计了 vm._render() 函数以及 vm._update() 函数的运行性能
      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  /*
  Watcher 观察者实例将对 updateComponent 函数求值，我们知道 updateComponent 函数的执行会间接触发渲染函数(vm.$options.render)的执行，
  而渲染函数的执行则会触发数据属性的 get 拦截器函数，从而将依赖(观察者)收集，当数据变化时将重新执行 updateComponent 函数，这就完成了重新渲染
  同时我们把这段代码中实例化的观察者对象称为 渲染函数的观察者
   */
  new Watcher(vm, updateComponent, noop, {
  before () {
    if (vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true /* isRenderWatcher */)
hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

/**
 * @description: 调用生命周期钩子函数
 * @param vm: 实例，hook: 生命周期函数名
 * 所以我们发现，对于生命周期钩子的调用，其实就是通过 this.$options 访问处理过的对应的生命周期钩子函数数组，遍历并执行它们。
 */
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  /*
    这里使用pushTarget()开头、popTarget()结尾。
    其实是为了避免在某些生命周期钩子中使用 props 数据导致收集冗余的依赖
   */
  pushTarget()
  //在选项合并中，我们知道 生命周期钩子选项最终会被合并处理成一个数组
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  // 由于开发者在编写组件时未必会写生命周期钩子，所以获取到的 handlers 可能不存在，所以使用 if 语句进行判断
  // 对于生命周期钩子的调用，其实就是通过 this.$options 访问处理过的对应的生命周期钩子函数数组，遍历并执行它们。
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      //调用生命周期函数
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  /*
  vm._hasHookEvent 是在 initEvents 函数中定义的，它的作用是判断是否存在生命周期钩子的事件侦听器，初始化值为 false 代表没有，
  当组件检测到存在生命周期钩子的事件侦听器时，会将 vm._hasHookEvent 设置为 true。什么叫做生命周期钩子的事件侦听器呢？即：
  <child
    @hook:beforeCreate="handleChildBeforeCreate"
    @hook:created="handleChildCreated"
    @hook:mounted="handleChildMounted"
    @hook:生命周期钩子
   />
  可以使用 hook: 加 生命周期钩子名称 的方式来监听组件相应的生命周期事件
  这是 Vue 官方文档上没有体现的，除非你对 Vue 非常了解，否则不建议使用。
  正是为了实现这个功能，才有了这段代码：
   */
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
