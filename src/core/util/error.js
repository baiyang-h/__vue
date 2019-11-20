/* @flow */

import config from '../config'
import { warn } from './debug'
import { inBrowser, inWeex } from './env'
import { isPromise } from 'shared/util'
import { pushTarget, popTarget } from '../observer/dep'

/**
 * @description: 用于错误处理
 * @param err：  catch 到的错误对象
 * @param vm：   传递 `Vue` 实例
 * @param info： `Vue` 特定的错误提示信息
 */
export function handleError (err: Error, vm: any, info: string) {
  // Deactivate deps tracking while processing error handler to avoid possible infinite rendering.
  // See: https://github.com/vuejs/vuex/issues/1505
  pushTarget()
  try {
    /*
    那么这个 if 判断是干嘛的呢？这其实是 Vue 选项 errorCaptured 的实现

     */
    if (vm) {
      let cur = vm
      while ((cur = cur.$parent)) {
        const hooks = cur.$options.errorCaptured
        if (hooks) {
          for (let i = 0; i < hooks.length; i++) {
            try {
              const capture = hooks[i].call(cur, err, vm, info) === false
              if (capture) return
            } catch (e) {
              globalHandleError(e, cur, 'errorCaptured hook')
            }
          }
        }
      }
    }
    globalHandleError(err, vm, info)
  } finally {
    popTarget()
  }
}

/**
 * @description: 执行生命周期函数
 */
export function invokeWithErrorHandling (
  handler: Function,    //生命周期函数
  context: any,         //vm
  args: null | any[],   //参数，以数组的形式
  vm: any,              //vm
  info: string          //文字信息
) {
  let res
  try {
    //执行生命周期函数
    res = args ? handler.apply(context, args) : handler.call(context)
    if (res && !res._isVue && isPromise(res) && !res._handled) {
      res.catch(e => handleError(e, vm, info + ` (Promise/async)`))
      // issue #9511
      // avoid catch triggering multiple times when nested calls
      res._handled = true
    }
  } catch (e) {
    //由于生命周期钩子是开发者自定义的函数，这个函数的执行是很可能存在运行时错误的，所以这里需要 try catch 包裹。然后使用 handleError 进行错误处理
    handleError(e, vm, info)
  }
  return res
}

/**
 * @description: 用来检测你是否自定义了 config.errorHandler 的，如果有则用之，如果没有就是用 logError
 */
function globalHandleError (err, vm, info) {
  //config.errorHandler 就是 Vue 全局API提供的用于自定义错误处理的配置
  //由于这个错误处理函数也是开发者自定义的，所以可能出现运行时错误，这个时候就需要使用 try catch 语句块包裹起来
  if (config.errorHandler) {
    try {
      return config.errorHandler.call(null, err, vm, info)
    } catch (e) {
      // if the user intentionally throws the original error in the handler,
      // do not log it twice
      if (e !== err) {
        logError(e, null, 'config.errorHandler')
      }
    }
  }
  logError(err, vm, info)
}

/**
 * @description: logError 才是真正打印错误的函数
 */
function logError (err, vm, info) {
  if (process.env.NODE_ENV !== 'production') {
    warn(`Error in ${info}: "${err.toString()}"`, vm)
  }
  /* istanbul ignore else */
  if ((inBrowser || inWeex) && typeof console !== 'undefined') {
    console.error(err)
  } else {
    throw err
  }
}
