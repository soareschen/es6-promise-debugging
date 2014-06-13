'use strict'

var domainLib = require('domain')

var domainProtectedPromise = function (construct, errorHandler) {
  return new Promise(function(resolve, reject) {
    var domain = domainLib.create()

    domain.on('error', function(err) {
      reject(err)
      errorHandler(err)
    })

    domain.run(function() {
      construct(resolve, reject)
    })
  })
}

var createPromise = function(construct) {
  return domainProtectedPromise(construct, console.trace)
}

createPromise(function(resolve, reject) {
  process.nextTick(function() {
    throw new Error('async error')

    resolve(1)
  })
}).then(function(res) {
  console.log('should never get result', res)
}, function(err) {
  console.log('got error', err)
})