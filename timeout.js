'use strict'

var timeoutPromise = function(timeout, construct) {
  return new Promise(function(resolve, reject) {
    construct(resolve, reject)

    setTimeout(function() {
      reject(new Error('timeout error'))
    }, timeout)
  })
}

var createPromise = function(construct) {
  return timeoutPromise(1000, construct)
}

createPromise(function(resolve, reject) {
  // forget to fulfill
}).then(function(res) {
  console.log('should never get result', res)
}, function(err) {
  console.log('got timeout error:', err)
})