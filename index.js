const debug = require('debug')('koa-ratelimit-lru')
const ms = require('ms')
const LRU = require("lru-cache")

module.exports = ratelimit

/**
 * Initialize ratelimit middleware with the given `opts`:
 *
 * - `duration` limit duration in milliseconds [1 minute]
 * - `max` max length of cache [Infinity]
 * - `rate` max requests per `id` [1000]
 * - `id` id to compare requests [ip]
 * - `body` custom throw body [json]
 * - `headers` custom header names
 *  - `remaining` remaining number of requests ['X-RateLimit-Remaining']
 *  - `reset` reset timestamp ['X-RateLimit-Reset']
 *  - `total` total number of requests ['X-RateLimit-Limit']
 *
 * @param {Object} opts
 * @return {Function}
 * @api public
 */

function ratelimit(opts = {}) {
    opts.headers = opts.headers || {}
    opts.headers.remaining = opts.headers.remaining || 'X-RateLimit-Remaining'
    opts.headers.reset = opts.headers.reset || 'X-RateLimit-Reset'
    opts.headers.total = opts.headers.total || 'X-RateLimit-Limit'
    opts.max = opts.max || Infinity
    opts.duration = opts.duration || 1000 * 60
    opts.rate = opts.rate || 1000

    let cache = LRU({
        max: opts.max,
        maxAge: opts.duration
    })

    const getByID = id => {
        // get with suffix
        const count = cache.get(id + ':count')
        let reset = cache.get(id + ':reset')

        const total = opts.rate

        let remaining
        if (count === undefined || reset === undefined) {
            const duration = (Date.now() + opts.duration) / 1000 | 0
            reset = duration
            cache.set(id + ':reset', duration)
            remaining = total
        } else {
            remaining = count > 0 ? count - 1 : 0
        }
        cache.set(id + ':count', remaining)
        return {
            remaining,
            reset,
            total
        }
    }

    return async (ctx, next) => {
        const id = opts.id ? opts.id(ctx) : ctx.ip
        const now = Date.now()

        if (false === id) {
            return await next()
        }

        // check limit
        const { remaining, reset, total } = getByID(id)

        const count = remaining > 0 ? remaining - 1 : 0

        // header fields
        let headers = {}
        headers[opts.headers.remaining] = count
        headers[opts.headers.reset] = reset
        headers[opts.headers.total] = total

        ctx.set(headers)

        debug('remaining %s/%s %s', count, total, id)
        if (remaining) {
            return await next()
        }
        const delta = (reset * 1000) - now | 0
        const after = reset - (now / 1000) | 0
        ctx.set('Retry-After', after)

        ctx.status = 429
        ctx.body = {
            msg: opts.errorMessage || 'Rate limit exceeded, retry in ' + ms(delta, { long: true }) + '.'
        }

        if (opts.throw) {
            ctx.throw(ctx.status, ctx.body, { headers: headers })
        }
    }
}