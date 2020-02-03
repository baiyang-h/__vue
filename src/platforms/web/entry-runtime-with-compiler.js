/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

//这个文件是完整版 Vue 的入口文件，在该文件中重新定义了 $mount 函数，但是保留了运行时 $mount 的功能，并在此基础上为 $mount 函数添加了编译模板的能力
//使用 mount 常量缓存了运行时版的 $mount 函数。之所以重写 $mount 函数，其目的就是为了给运行时版的 $mount 函数增加编译模板的能力
const mount = Vue.prototype.$mount
/*
  该函数作用：
    1. 重新定义 $mount 函数， 在原来的基础上增加了编译模板的能力
    2. 如果有render函数，则直接使用render函数，如果没有，则是否有template，没有，则是否有el。将模板字符串通过compileToFunctions函数编译成渲染函数
    3. 重新执行运行时的$mount函数
 */
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)   //dom，这个元素是一个挂载点

  /* istanbul ignore if */
  // 检测了挂载点是不是 <body> 元素或者 <html> 元素
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  //判断渲染函数是否存在，如果存在什么都不用做，不存在执行以下判断
  // render -> template -> el
  if (!options.render) {
    // 如果渲染函数不存在，则 使用 template 或 el 选项构建渲染函数。
    // 在没有render的情况下，优先使用template，并尝试将 template 编译成渲染函数。
    // template也没有的情况下，这时会检测 el 是否存在，存在的话则使用 el.outerHTML 作为 template 的值
    let template = options.template
    if (template) {
      /*
        - template为字符串的情况
            1. 如果第一个字符是 #，那么会把该字符串作为 css 选择符去选中对应的元素，并把该元素的 innerHTML 作为模板。即会用 document.quertSelector('#xx')的innerHtml
            2. 如果第一个字符不是 #，那么什么都不做，就用 template 自身的字符串值作为模板
        - template 的类型是元素节点(template.nodeType 存在)，则使用该元素的 innerHTML 作为模板
        - 若 template 既不是字符串又不是元素节点，那么在非生产环境会提示开发者传递的 template 选项无效

        经过以上逻辑的处理之后，理想状态下此时 template 变量应该是一个模板字符串，将来用于渲染函数的生成
      */
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      //getOuterHTML  就是获取el.outerHTML，但是outerHTML存在兼容问题，所以以下函数做了兼容处理
      template = getOuterHTML(el)
    }
    // 此时 template 是一个模板字符串，当然也存在 template 可能是空的情况
    // template 变量中存储着最终用来生成渲染函数的字符串
      //核心就是使用compileToFunctions函数将模板(template)字符串编译为渲染函数(render)，并将渲染函数添加到 vm.$options 选项中
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 并在重新定义的 $mount 函数体内调用了缓存下来的运行时版的 $mount 函数
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}
// Vue.compile 函数是 Vue 暴露给开发者的工具函数，他能够将字符串编译为渲染函数。
Vue.compile = compileToFunctions

export default Vue
