let $ = require('jquery')
let co = require('co')
let {assert} = require('referee')
let {suite, test, beforeEach, afterEach} = window
let TestApp = require('./testApp')
let Promise = require('es6-promise').Promise
let app, router

suite('Cherrytree app')

beforeEach(() => {
  window.location.hash = '/'
  app = new TestApp()
  router = app.router
  return app.start()
})

afterEach(() => {
  app.destroy()
})

test('transition occurs when location.hash changes', (done) => {
  router.use((transition) => {
    transition.then(() => {
      assert.equals(transition.path, '/about')
      assert.equals($('.application .outlet').html(), 'This is about page')
      done()
    }).catch(done, done)
  })

  window.location.hash = '#about'
})

test('programmatic transition via url and route names', () => {
  return co(function * () {
    yield router.transitionTo('about')
    yield router.transitionTo('/faq?sortBy=date')
    assert.equals($('.application .outlet').html(), 'FAQ. Sorted By: date')
    yield router.transitionTo('faq', {}, { sortBy: 'user' })
    assert.equals($('.application .outlet').html(), 'FAQ. Sorted By: user')
  })
})

test('cancelling and retrying transitions', () => {
  return co(function * () {
    yield router.transitionTo('/posts/filter/foo')
    assert.equals(router.location.getURL(), '/posts/filter/foo')
    var transition = router.transitionTo('about')
    transition.cancel()
    yield transition.catch(() => {})
    assert.equals(router.location.getURL(), '/posts/filter/foo')

    yield transition.retry()
    assert.equals(router.location.getURL(), '/about')
  })
})

test('transition.followRedirects resolves when all of the redirects have finished', () => {
  return co(function * () {
    var transition

    yield router.transitionTo('index')
    // initiate a transition
    transition = router.transitionTo('/posts/filter/foo')
    // and a redirect
    router.transitionTo('/about')

    // if followRedirects is not used - the original transition is rejected
    var rejected = false
    yield transition.catch(() => rejected = true)
    assert(rejected)

    yield router.transitionTo('index')
    // initiate a redirect
    router.transitionTo('/posts/filter/foo')
    // and a redirect
    router.transitionTo('/about')

    // when followRedirects is used - the promise is only
    // resolved when both transitions finish
    yield transition.followRedirects()
    assert.equals(router.location.getURL(), '/about')
  })
})

test('transition.followRedirects is rejected if transition fails', () => {
  return co(function * () {
    var transition

    // silence the errors for the tests
    router.logError = () => {}

    // initiate a transition
    transition = router.transitionTo('/posts/filter/foo')
    // install a breaking middleware
    router.use(() => {
      throw new Error('middleware error')
    })
    // and a redirect
    router.transitionTo('/about')

    var rejected = false
    yield transition.followRedirects().catch((err) => rejected = err.message)
    assert.equals(rejected, 'middleware error')
  })
})

test('transition.followRedirects is rejected if transition fails asynchronously', () => {
  return co(function * () {
    var transition

    // silence the errors for the tests
    router.logError = () => {}

    // initiate a transition
    transition = router.transitionTo('/posts/filter/foo')
    // install a breaking middleware
    router.use(() => {
      return Promise.reject(new Error('middleware promise error'))
    })
    // and a redirect
    router.transitionTo('/about')

    var rejected = false
    yield transition.followRedirects().catch((err) => rejected = err.message)
    assert.equals(rejected, 'middleware promise error')
  })
})

test.skip('cancelling transition does not add a history entry', () => {
  return co(function * () {
    // we start of at faq
    yield router.transitionTo('faq')
    // then go to posts.filter
    yield router.transitionTo('posts.filter', {filterId: 'foo'})
    assert.equals(window.location.hash, '#posts/filter/foo')

    // now attempt to transition to about and cancel
    var transition = router.transitionTo('/about')
    transition.cancel()
    yield transition.catch(() => {})

    // the url is still posts.filter
    assert.equals(window.location.hash, '#posts/filter/foo')

    // going back should now take as to faq
    console.log('HERE')
    yield new Promise((resolve, reject) => {
      router.use((transition) => {
        console.log('TRANS')
        transition.then(() => {
          assert.equals(window.location.hash, '#faq')
          resolve()
        }).catch(reject)
      })
      window.history.back()
    })
  })
})

test('navigating around the app', () => {
  return co(function * () {
    assert.equals($('.application .outlet').html(), 'Welcome to this application')

    yield router.transitionTo('about')
    assert.equals($('.application .outlet').html(), 'This is about page')

    yield router.transitionTo('/faq?sortBy=date')
    assert.equals($('.application .outlet').html(), 'FAQ. Sorted By: date')

    yield router.transitionTo('faq', {}, { sortBy: 'user' })
    assert.equals($('.application .outlet').html(), 'FAQ. Sorted By: user')

    // we can also change the url directly to cause another transition to happen
    yield new Promise(function (resolve) {
      router.use(resolve)
      window.location.hash = '#posts/filter/mine'
    })
    assert.equals($('.application .outlet').html(), 'My posts...')

    yield new Promise(function (resolve) {
      router.use(resolve)
      window.location.hash = '#posts/filter/foo'
    })
    assert.equals($('.application .outlet').html(), 'Filter not found')
  })
})

test('url behaviour during transitions', () => {
  return co(function * () {
    assert.equals(window.location.hash, '#/')
    let transition = router.transitionTo('about')
    assert.equals(window.location.hash, '#about')
    yield transition
    assert.equals(window.location.hash, '#about')
    // would be cool to test history.back() here
    // but in IE it reloads the karma iframe, so let's
    // use a regular location.hash assignment instead
    // window.history.back()
    window.location.hash = '#/'
    yield new Promise((resolve) => {
      router.use((transition) => {
        assert.equals(window.location.hash, '#/')
        resolve()
      })
    })
  })
})

test('url behaviour during failed transitions', () => {
  return co(function * () {
    router.logError = () => {}
    yield router.transitionTo('about')
    yield new Promise((resolve, reject) => {
      // setup a middleware that will fail
      router.use((transition) => {
        // but catch the error
        transition.catch((err) => {
          assert.equals(err.message, 'failed')
          assert.equals(window.location.hash, '#faq')
          resolve()
        }).catch(reject)
        throw new Error('failed')
      })
      router.transitionTo('faq')
    })
  })
})
