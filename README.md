
# koa-ratelimit-lru

Rate limiter middleware backed by lru-cache for koa@2

## Koa2

Middleware using `async/await` , so you have to run in Node.js >= 7.0.0 with `--harmony_async_await`  or using `babel`

## Installation

```js
$ npm install koa-ratelimit-lru
```

## Example

```js
const ratelimit = require('koa-ratelimit-lru')
const Koa = require('koa')
const app = new Koa()

// apply rate limit

app.use(ratelimit({
  duration: 60000,
  rate: 100,
  id (ctx) {
    return ctx.ip
  },
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total'
  },
  errorMessage: 'Sometimes You Just Have to Slow Down.'
}))

// response middleware

app.use(ctx => {
  ctx.body = 'Hello World'
})

app.listen(3000, _ => console.log('listening on port 3000'))
```

Using one `lru-cache` to store keys

```javascript
const ratelimit = require('koa-ratelimit-lru')
const Koa = require('koa')
const router = require('koa-router')()
const app = new Koa()
const store = require('lru-cache')()

// Note: When you using custom store, duration and max would lose efficacy

router.get(
    '/foo',
    ratelimit({
        store,
        rate: 5,
        prefix: 'foo:'
    }),
    ctx => ctx.body = 'foo'
)

router.get(
    '/bar',
    ratelimit({
        store,
        rate: 10,
        prefix: 'bar:'
    }),
    ctx => ctx.body = 'bar'
)

// response middleware

app.use(router.routes())

app.listen(3000, _ => console.log('listening on port 3000'))
```

## Options

* `duration` limit duration in milliseconds [1 minute]
* `max` max length of cache [Infinity]
* `store` custom lru-cache [new cache]
* `prefix` custom prefix in lru-cache [ratelimit:]
* `rate` max requests per `id` [1000]
* `id` id to compare requests [ip]
* `body` custom throw body [json]
* `headers` custom header names
* `remaining` remaining number of requests [`'X-RateLimit-Remaining'`]
* `reset` reset timestamp [`'X-RateLimit-Reset'`]
* `total` total number of requests [`'X-RateLimit-Limit'`]

## Responses

  Example 200 with header fields:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1477978284
Content-Type: text/plain; charset=utf-8
Content-Length: 12
Date: Tue, 01 Nov 2016 05:13:11 GMT
Connection: keep-alive

Stuff!
```

  Example 429 response:

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1477978284
X-RateLimit-Limit: 100
Retry-After: 2
Content-Type: application/json; charset=utf-8
Content-Length: 50
Date: Tue, 01 Nov 2016 05:31:21 GMT
Connection: keep-alive

{"msg":"Rate limit exceeded, retry in 3 seconds."}
```

## License

  MIT