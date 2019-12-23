/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */
//该文件只做了一件事情，那就是导出 arrayMethods 对象
import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 1. 该循环的主要目的就是使用 def 函数在 arrayMethods 对象上定义与数组变异方法同名的函数，从而做到拦截的目的
 * 2. 对于push、unshift 和 splice这三个变异方法，添加的新元素变为响应式数据
 * 3. 当调用数组变异方式时调用ob.dep.notify()，将该数组的所有依赖(观察者)全部拿出来执行
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)     //调用数组的方法，如push，pop...
    const ob = this.__ob__
    let inserted
    //push、unshift 和 splice，这三个变异方法都可以为数组添加新的元素，那么为什么要重点关注呢？
    //原因很简单，因为新增加的元素是非响应式的，所以我们需要获取到这些新元素，并将其变为响应式数据才行
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args   // 插入的新数据
        break
      case 'splice':
        inserted = args.slice(2)  //插入的新数据
        break
    }
    //对插入的数据进行观测， 只有对插入的数据是一个对象和数组的情况才观测，在observe函数中会有
    if (inserted) ob.observeArray(inserted)
    // notify change
    //当调用数组变异方法时，必然修改了数组，所以这个时候需要将该数组的所有依赖(观察者)全部拿出来执行，即：ob.dep.notify()
    ob.dep.notify()
    return result
  })
})
