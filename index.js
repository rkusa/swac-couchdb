var nano = require('nano')(process.env.CLOUDANT_URL || 'http://localhost:5984')

var Definition = function(db, design, define, callback) {
  this.db = db
  this.design = design
  this.queue = []
  this.views = {}
  this.callback = function() {
    if (this.queue.length === 0) {
      if (callback) callback()
    } else {
      (this.queue.shift())()
    }
  }
  if (define) define.call(this)
  var that = this
  process.nextTick(function() {
    if (that.queue.length > 0) (that.queue.shift())()
  })
}

Definition.prototype.view = function(name, view) {
  var that = this

  if (typeof view === 'function') {
    this.views[name] = view
    this.callback()
  } else {
    this.queue.push(function() {
      that.db.get(that.design, function(err, body) {
        if (err) {
          if (err.status_code !== 404) throw err
          else {
            body = {
              language: 'javascript',
              views: {}
            }
          }
        }
        body.views[name] = !view.map ? { map: view } : view
        that.db.insert(body, that.design, that.callback.bind(that))
      })
    })
  }
}

exports.initialize = function(model, opts, define, cb) {
  var db = nano.use(opts.db)
    , api = {}
    , definition = new Definition(db, '_design/' + model._type, define, cb)
  definition.view('all', {
    map: "function (doc) { if(doc.$type === '" + model._type + "') emit(doc._id, null); }"
  })

  api.list = function(/*view, key, callback*/) {
    var args = Array.prototype.slice.call(arguments)
      , callback = args.pop()
      , view = args.shift() || 'all'
      , key = args.shift() || null
      , params = { include_docs: true }
    if (key) params.key = key
    if (!callback) callback = function() {}

    var fn
    if (definition.views[view])
      fn = definition.views[view].bind(db, key, process.domain.req)
    else
      fn = db.view.bind(db, model._type, view, params)

    fn(function(err, body) {
      if (err) return callback(err)
      var rows = []
      body.rows.forEach(function(data) {
        data.doc._id = data.id
        data.doc.id = data.id.indexOf(model._type) === 0
                        ? data.id.substr(model._type.length + 1)
                        : data.id
        var row = new model(data.doc)
        row.isNew = false
        rows.push(row)
      })
      callback(null, rows)
    })
  }
  api.get = function(id, callback) {
    if (!callback) callback = function() {}
    if (!id) return callback(null, null)
    if (!id.match(/^[a-z0-9]{32}$/)) id = model._type + '/' + id
    db.get(id, function(err, body) {
      if (err) {
        switch (err.message) {
          case 'missing':
          case 'deleted':
            return callback(null, null)
          default:
            return callback(err)
        }
      }
      body.id = body._id.indexOf(model._type) === 0
                  ? body._id.substr(model._type.length + 1)
                  : body._id
      var row = new model(body)
      row.isNew = false
      callback(null, row)
    })
  }
  api.put = function(id, props, callback) {
    if (!callback) callback = function() {}
    if (!id.match(/^[a-z0-9]{32}$/)) id = model._type + '/' + id
    db.get(id, function(err, body) {
      if (err) return callback(err)
      body.id = body._id.indexOf(model._type) === 0
                  ? body._id.substr(model._type.length + 1)
                  : body._id
      var row = new model(body)
      row.isNew = false
      row.updateAttributes(props)
      var data = row.toJSON()
      data._id = body._id
      delete data.id
      data._rev = body._rev
      data.$type = model._type
      db.insert(data, data.id, function(err) {
        if (err) return callback(err)
        callback(null, row)
      })
    })
  }
  api.post = function(props, callback) {
    if (!callback) callback = function() {}
    if (props instanceof model) {
      props = props.toJSON()
    }
    if (props.id) props._id = model._type + '/' + props.id
    delete props.id
    props.$type = model._type
    db.insert(props, props._id, function(err, body) {
      if (err) return callback(err)
      props._id = body.id
      props.id = body.id.indexOf(model._type) === 0
                  ? body.id.substr(model._type.length + 1)
                  : body.id
      var row = new model(props)
      row.isNew = false
      callback(null, row)
    })
  }
  api.delete = function(id, callback) {
    if (!callback) callback = function() {}
    if (!id.match(/^[a-z0-9]{32}$/)) id = model._type + '/' + id
    db.get(id, function(err, body) {
      if (err) return callback(err)

      db.destroy(id, body._rev, function(err) {
        if (err) return callback(err)
        callback()
      })
    })
  }

  return api
}
