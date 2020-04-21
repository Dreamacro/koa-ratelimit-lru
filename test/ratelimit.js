const request = require('supertest')
const should = require('should')
const Koa = require('koa')
const LRU = require('lru-cache')

const ratelimit = require('../')

describe('ratelimit-lru middleware', _ => {
    const rateLimitDuration = 1000
    const goodBody = "Num times hit: "

    describe('limit', _ => {
        let app
        let guard

        const routeHitOnlyOnce = _ => guard.should.be.equal(1)

        beforeEach(done => {
            app = new Koa()
            guard = 0

            app.use(ratelimit({
                duration: rateLimitDuration,
                rate: 1
            }))

            app.use(ctx => ctx.body = goodBody + (++guard))

            setTimeout(_ => {
                request(app.listen())
                    .get('/')
                    .expect(200, goodBody + '1')
                    .expect(routeHitOnlyOnce)
                    .end(done)
            }, rateLimitDuration)
        })

        it('responds with 429 when rate limit is exceeded', done => {
            request(app.listen())
                .get('/')
                .expect('X-RateLimit-Remaining', '0')
                .expect(429)
                .end(done)
        })

        it('should not yield downstream if ratelimit is exceeded', done => {
            request(app.listen())
                .get('/')
                .expect(429)
                .end(_ => {
                    routeHitOnlyOnce()
                    done()
                })
        })
    })

    describe('limit with throw', function() {
        let guard
        let app

        const routeHitOnlyOnce = _ => guard.should.be.equal(1)

        beforeEach(done => {
            app = new Koa()
            guard = 0

            app.use(async (ctx, next) => {
                try {
                    await next()
                } catch (e) {
                    ctx.set(e.headers)
                    ctx.body = {
                        msg: e.message
                    }
                }
            })

            app.use(ratelimit({
                duration: rateLimitDuration,
                rate: 1,
                throw: true
            }))

            app.use(ctx => ctx.body = goodBody + (++guard))

            setTimeout(_ => {
                request(app.listen())
                    .get('/')
                    .expect(200, goodBody + "1")
                    .expect(routeHitOnlyOnce)
                    .end(done)
            }, rateLimitDuration)
        })

        it('responds with 429 when rate limit is exceeded', done => {
            request(app.listen())
                .get('/')
                .expect('X-RateLimit-Remaining', '0')
                .expect(429)
                .end(done)
        })
    })

    describe('id', done => {
        it('should allow specifying a custom `id` function', done => {
            const app = new Koa()

            app.use(ratelimit({
                rate: 1,
                id (ctx) {
                    return ctx.request.header.foo
                }
            }))

            request(app.listen())
                .get('/')
                .set('foo', 'bar')
                .expect(res => res.header['x-ratelimit-remaining'].should.equal('0'))
                .end(done)
        })

        it('should not limit if `id` returns `false`', done => {
            const app = new Koa()

            app.use(ratelimit({
                id (ctx) {
                    return false
                },
                rate: 5
            }))

            request(app.listen())
                .get('/')
                .expect(res => res.header.should.not.have.property('x-ratelimit-remaining'))
                .end(done)
        })

        it('should limit using the `id` value', done => {
            const app = new Koa()

            app.use(ratelimit({
                rate: 1,
                id (ctx) {
                    return ctx.request.header.foo
                }
            }))

            app.use(ctx => ctx.body = ctx.request.header.foo)

            request(app.listen())
                .get('/')
                .set('foo', 'bar')
                .expect(200, 'bar')
                .end(_ => {
                    request(app.listen())
                        .get('/')
                        .set('foo', 'biz')
                        .expect(200, 'biz')
                        .end(done)
                })
        })
    })

    describe('custom headers', _ => {
        it('should allow specifying a custom header names', done => {
            const app = new Koa()

            app.use(ratelimit({
                rate: 1,
                headers: {
                    remaining: 'Rate-Limit-Remaining',
                    reset: 'Rate-Limit-Reset',
                    total: 'Rate-Limit-Total'
                }
            }))

            request(app.listen())
                .get('/')
                .set('foo', 'bar')
                .expect(res => {
                    const headers = Object.keys(res.headers)
                    headers.should.containEql('rate-limit-remaining', 'rate-limit-reset', 'rate-limit-total')
                    headers.should.not.containEql('x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset')
                })
                .end(done)
        })
    })

    describe('custom error message', _ => {
        it('should allow specifying a custom error message', done => {
            const app = new Koa()
            const errorMessage = 'Sometimes You Just Have to Slow Down.'

            app.use(ratelimit({
                rate: 1,
                errorMessage
            }))

            request(app.listen())
                .get('/')
                .expect(200)
                .end(_ => {
                    request(app.listen())
                        .get('/')
                        .expect(429, {
                            msg: errorMessage
                        })
                        .end(done)
                })
        })

        it('should return default error message when not specifying', done => {
            const app = new Koa()

            app.use(ratelimit({
                rate: 1,
                duration: rateLimitDuration
            }))

            request(app.listen())
                .get('/')
                .expect(200)
                .end(_ => {
                    request(app.listen())
                        .get('/')
                        .set('foo', 'bar')
                        .expect(429)
                        .expect(res => res.body.msg.should.match(/Rate limit exceeded, retry in \d+ ms./))
                        .end(done)
                })
        })
    })

    describe('custom store', _ => {
        it('should store keys in lru-cache', done => {
            const app = new Koa()
            const store = new LRU()

            app.use(ratelimit({
                store,
                id (ctx) {
                    return 'foo'
                }
            }))

            request(app.listen())
                .get('/')
                .expect(200)
                .end(_ => {
                    const ret = store.get('ratelimit:foo:count')
                    ret.should.not.undefined()
                    done()
                })
        })
    })

    describe('custom prefix', _ => {
        it('should have right prefix in lru-cache', done => {
            const app = new Koa()
            const store = new LRU()

            app.use(ratelimit({
                store,
                prefix: 'bar:',
                id (ctx) {
                    return 'foo'
                }
            }))

            request(app.listen())
                .get('/')
                .expect(200)
                .end(_ => {
                    const ret = store.get('bar:foo:count')
                    ret.should.not.undefined()
                    done()
                })
        })
    })
})