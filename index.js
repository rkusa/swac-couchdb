var nano = require('nano')(process.env.CLOUDANT_URL || 'http://localhost:5984')

var API = function(db, model, define, callback) {
  this.db     = db
  this.model  = model
  this.design = '_design/' + model._type
  this.queue  = []
  this.views  = {}
  this.params = {}
  this.callback = function() {
    if (this.queue.length === 0) {
      if (callback) callback()
    } else {
      (this.queue.shift())()
    }
  }
  if (define) define.call(this)
}

API.prototype.initialize = function() {
  if (this.queue.length > 0) (this.queue.shift())()
}

API.prototype.view = function(name, view) {
  var that = this

  this.params[name] = {}
  if (typeof view === 'function') {
    this.queue.push(function() {
      that.views[name] = view
      that.callback()
    })
  } else {
    if (!view.reduce) this.params[name].include_docs = true
    else this.params[name].reduce = true
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

API.prototype.filter = function(name, filter) {
  var that = this

  this.queue.push(function() {
    that.db.get(that.design, function(err, body) {
      if (err) {
        if (err.status_code !== 404) throw err
        else {
          body = {
            language: 'javascript',
            filters: {}
          }
        }
      }
      if (!body.filters) body.filters = {}
      body.filters[name] = filter.toString()
      that.db.insert(body, that.design, that.callback.bind(that))
    })
  })
}

API.prototype.extractId = function(id) {
  return id.indexOf(this.model._type) === 0
    ? id.substr(this.model._type.length + 1)
    : id
}

API.prototype.adaptId = function(id) {
  if (!id.match(/^[a-z0-9]{32}$/) && id.indexOf(this.model._type) === -1)
    id = this.model._type + '/' + id
  return id
}

API.prototype.createModel = function(id, data, rev) {
  data.id               = this.extractId(id)
  var instance          = new this.model(data)
  instance._id          = id
  instance._rev         = rev
  instance._attachments = data._attachments
  instance.isNew        = false
  return instance
}

API.prototype.get = function(id, callback) {
  if (!callback) callback = function() {}
  if (!id) return callback(null, null)

  var that = this, id = this.adaptId(id)
  
  if (!process.domain.couchdb) process.domain.couchdb = {}
  
  if (id in process.domain.couchdb)
    return callback(null, process.domain.couchdb[id])
  
  this.db.get(id, function(err, body) {
    if (err) {
      switch (err.message) {
        case 'missing':
        case 'deleted':
          return callback(null, null)
        default:
          return callback(err, null)
      }
    }

    callback(null, process.domain.couchdb[id] = that.createModel(body._id, body, body._rev))
  })
}

API.prototype.list = function(/*view, key, callback*/) {
  var args = Array.prototype.slice.call(arguments)
    , that = this
    , callback = args.pop()
    , view = args.shift() || 'all'
    , key = args.shift() || null
    , params = this.params[view]
  
  if (params === undefined)
    throw new Error('View ' + view + ' for ' + this.model._type + ' does not exsist')
  
  var id = [this.model._type, view, key].join('/')
  if (!process.domain.couchdb) process.domain.couchdb = {}

  if (id in process.domain.couchdb)
    return callback(null, [].concat(process.domain.couchdb[id]))
    
  if (key)       params.key = key
  if (!callback) callback = function() {}
  
  var fn
  if (this.views[view])
    fn = this.views[view].bind(this.db, key, process.domain.req)
  else
    fn = this.db.view.bind(this.db, this.model._type, view, params)

  fn(function(err, body) {
    if (err) return callback(err, null)
    if (!body || !body.rows || !Array.isArray(body.rows))
      return callback(null, body || null)
    var rows = []
    body.rows.forEach(function(data) {
      var doc = data.value || data.doc
      rows.push(that.createModel(doc._id, doc, doc._rev))
    })
    callback(null, process.domain.couchdb[id] = rows)
  })
}

API.prototype.put = function(instance, callback) {
  if (!callback) callback = function() {}
  var data   = instance.toJSON(true)
  data._rev  = instance._rev
  data._id   = instance._id
  data.$type = instance._type
  if (instance._attachments !== null)
    data._attachments = instance._attachments
  delete data.id
  
  if (!process.domain.couchdb) process.domain.couchdb = {}
  
  this.db.insert(data, instance._id, function(err, res) {
    if (err) return callback(err, null)
    instance._rev  = res.rev
    instance.isNew = false
    callback(null, process.domain.couchdb[instance._id] = instance)
  })
}

API.prototype.post = function(props, callback) {
  if (!callback) callback = function() {}

  var model = props instanceof this.model ? props : new this.model(props)
  props = model.toJSON(true)

  if (props.id) props._id = this.model._type + '/' + props.id
  delete props.id
  props.$type = this.model._type

  if (!process.domain.couchdb) process.domain.couchdb = {}

  var that = this
  this.db.insert(props, props._id, function(err, body) {
    if (err) return callback(err, null)
    if (!model.id) model.id = body.id
    model._id = body.id
    model._rev = body.rev
    model.isNew = false
    callback(null, process.domain.couchdb[model._id] = model)
  })
}


API.prototype.delete = function(instance, callback) {
  if (!callback) callback = function() {}
  if (!process.domain.couchdb) process.domain.couchdb = {}
  this.db.destroy(instance._id, instance._rev, function(err) {
    if (err) return callback(err)
    process.domain.couchdb[instance._id] = null
    callback(null)
  })
}

exports.initialize = function(model, opts, define, callback) {
  var db = nano.use(opts.db)
    , api = new API(db, model, define, callback)

  api.view('all', {
    map: "function (doc) { if(doc.$type === '" + model._type + "') emit(doc._id, null); }"
  })
  
  api.initialize()

  Object.defineProperties(model.prototype, {
    _id:          { value: null, writable: true },
    _rev:         { value: null, writable: true },
    _attachments: { value: null, writable: true }
  })

  return api
}
