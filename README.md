# ES6 Promise Debugging Techniques

In my [blog post](http://blog.soareschen.com/the-problem-with-es6-promises) I highlighted a few of the potential problems of using promises incorrectly. In particular ES6 Promise silently ignore many errors that may make it difficult to debug promise-based applications.

Now I have come out with a few solutions to expose these ignored errors, and hopefully make ease of debugging. The solution involves wrapping the promise constructor so that additional probes can be attached to detect incorrect promise usage.

In the examples promises are constructed using a constructor function `createPromise()` instead of the canonical `new Promise()` expression. This is so that the promise constructor can be wrapped and changed at runtime to detect promise-related bugs during development. A default implementation of `createPromise()` is simply calls the native Promise constructor:

```javascript
var createPromise = function(construct) {
  return new Promise(construct)
}
```

## Timeout

The simplest kind of promise bug is having the promise never being fulfilled by the creator. This could for example happen when a promise creator include an empty constructor body:

```javascript
createPromise(function(resolve, reject) {
  // forget to fulfill
}).then(...)
```

This will cause the entire promise chain to halt, and user will have hard time determining the source of the bug. In this way Promise has the same problem as the async callback in which the async function implementor may forget to call the callback:

```javascript
var doSomething = function(callback) {
  // forget to call callback
}
```

However such bug can easily be detected if we modify the promise constructor and set a timeout limit:

```javascript
var timeoutPromise = function(timeout, construct) {
  return new Promise(function(resolve, reject) {
    construct(resolve, reject)

    setTimeout(function() {
      reject(new Error('timeout error'))
    }, timeout)
  })
}
```

In this example the timeout promise intercept the `reject` function before forwarding to the constructor caller. It then set a timeout function that reject the promise. In this case the nature of Promise ignoring errors actually work in our favor: if the caller fulfill the promise before timeout, then calling reject inside the timeout function is simply silently ignored.

With this simple trick, if a promise chain ever halt a user can simply detect the bug by changing the `createPromise()` function:

```javascript
createPromise = function(construct) {
  return timeoutPromise(1000, construct)
}
```

Full source at [timeout.js](timeout.js), with an example in the end.


## Double Fulfill

Another potential promise bug is when a user try to fulfill a promise more than once:

```javascript
createPromise(function(resolve, reject) {
  resolve(1)
  resolve(2)
})
```

Such mistake could for example happen inside a badly written control flow. However because `Promise` simply ignore subsequent fulfillment, a program may simply behave in unexpected way without giving clue on the source of error. 

The mistake is equivalent to calling callback multiple times in async functions, albeit with less negative side effect:

```javascript
var doSomething = function(callback) {
  callback(null, 1)
  callback(null, 2)
}
```

The double fulfillment error can again be detected by wrapping the promise constructor. In this example an error handler is provided so that the error can be gracefully handled.

```javascript
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
```

With that one can for example report the error to the console:

```javascript
var createPromise = function(construct) {
  return detectDoubleFulfilledPromise(construct, console.trace)
}
```

Ideally though we want such error detection to built right into the native Promise implementation. The `Promise` class should allow error handler to be attached somewhere, so that all promise-related errors can be reported.

Full source at [double-fulfill.js](double-fulfill.js)

## Domain

Promise could also be the perfect replacement of Node's domain. By putting domain inside a promise constructor, one can safely wrap any async functions and ensure all errors being caught and handled as rejection.

```javascript
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
```

It would be great if this can be added into the ES6 standard, but I suspect it is not easy to standardize how async errors should be captured. At least this could be independenly implemented in Node first and set as a use case to be standardized in ES7.

For a proper implementation, I'd recommend the Node core team to make a new implementation independent of the existing domain library and add it inside the native Promise implementation. The implementation could be much more simpler than the original domain implementation, because it become an internal part of promise that cannot be manipulated by users. 

Full source at [domain.js](domain.js)

## Uncaught Error

The last but probably most common promise bug is on improper handling of rejected promises. It will be a very common mistake for one to never attach a catch handler:

```javascript
createPromise(function(resolve, reject) {
  reject(1)
}).then(function(res) {
  console.log('should never get result')
})
```

But even if a catch handler is attached, exception can still occur inside the catch handler:

```javascript
createPromise(function(resolve, reject) {
  reject(1)
}).catch(function(err) {
  console.log('trying to recover from error', err)
  throw new Error('error inside error handler')
  console.log('should never managed to recover fully')
})
```

In such case the error recover failed but is silently ignored, making it almost impossible to detect and debug.

One way to solve this in the userland is to attach two catch handlers, with the second catch handler used to signal fatal error:

```javascript
createPromise(function(resolve, reject) {
  reject(1)
}).catch(function(err) {
  throw new Error('error inside error handler')

}).catch(function(err) {
  console.log('A fatal error has occured!', err)
  // Abort program or close down cluster instance
  abort()
})
```

I'd call this the _double catch pattern_ and would recommend everyone to use that at the end of a promise chain.

Nevertheless, not everyone would use such pattern and it is too tempting to not attach any catch handler at all. Hence I'd recommend another promise wrapper used to detect the lack of error handling at the end of a promise chain:

```javascript
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
```

The implementation is a bit long, but what it essentially does is to wrap around a promise's `.then()` and `.catch()` methods to detect whether catch handler is attached to the end of a promise chain. Because a promise might not be chained immediately, a timeout is set before the wrapper checks whether it reach the end of a promise chain. 

If the wrapper finds itself at the end of promise chain and no catch handler is attached, an error is reported to the error handler together with the stack location of the last `.then()` chain. Otherwise the wrapper attach an additional catch handler at the end of promise chain, and use it to report any fatal error to the error handler.

Unlike earlier examples, this function wraps around promise instances. However it needs to be called inside the promise constructor to debug all promises created.

```javascript
var createPromise = function(construct) {
  var promise = new Promise(construct)
  return detectUncaughtPromise(promise, 1000)
}
```

A native implementation may be much more efficient in detecting the end of promise chain.

Full source at [uncaught.js](uncaught.js)

# Conclusion

I presented four common bugs that can occur when using promises, all of which are either silently ignored or very hard to debug with current standard. I also come out with non-intrusive solutions that will make such debugging much easier. Some simplified example code is shown here to demonstrate how the solution could be implemented. Ultimately these solutions should be standardized and implemented natively in ES6 Promise.

This article is intended as a start to spark discussion with the JavaScript community to improve Promise before ES6 is finalized.