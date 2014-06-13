'use strict'

var detectUncaughtPromise = function(promise, timeout, prevCaught) {
  var wrappedPromise = Object.create(promise)

  var chained = false
  var stack = new Error().stack

  wrappedPromise.then = function(onResolved, onRejected) {
    chained = true
    var nextCaught = onRejected ? true : false

    var newPromise = promise.then(onResolved, onRejected)
    return detectUncaughtPromise(newPromise, timeout, nextCaught)
  }

  wrappedPromise.catch = function(errHandler) {
    chained = true

    var newPromise = promise.catch(errHandler)
    return detectUncaughtPromise(newPromise, timeout, true)
  }

  setTimeout(function() {
    if(chained) return

    if(!prevCaught) {
      console.log('uncaught terminal promise detected.',
        'last then() was on:', stack)
    } else {
      promise.catch(function(err) {
        console.log('exception occured inside error handler',
          'of last promise chain:', err)
      })
    }
  }, timeout)

  return wrappedPromise
}

var createPromise = function(construct) {
  var promise = new Promise(construct)
  return detectUncaughtPromise(promise, 1000)
}

createPromise(function(resolve, reject) {
  reject(1)
}).then(function(res) {
  console.log('should never get result')
})

createPromise(function(resolve, reject) {
  reject(1)
}).catch(function(err) {
  console.log('trying to recover from error', err)
  throw new Error('error inside error handler')
  console.log('should never managed to recover fully')
})