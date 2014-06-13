'use strict'

var detectDoubleFulfilledPromise = function(construct, errHandler) {
  return new Promise(function(resolve, reject) {
    var fulfilled = false

    var wrap = function(fulfill) {
      return function(val) {
        if(fulfilled) errHandler(new Error(
          'promise is fulfilled multiple time'))

        fulfilled = true
        fulfill(val)
      }
    }

    construct(wrap(resolve), wrap(reject))
  })
}

var createPromise = function(construct) {
  return detectDoubleFulfilledPromise(construct, console.trace)
}

createPromise(function(resolve, reject) {
  resolve(1)
  resolve(2)
}).then(function(res) {
  console.log('got result:', res)
})