const Koa = require('koa')
const app = new Koa()
const ratelimit = require('./')

// ratelimit
app.use(ratelimit({
    rate: 50
}))

app.use(ctx => {
    ctx.body = 'Hello World!'
})

app.listen(3000, _ => console.log('listening on port 3000'))
