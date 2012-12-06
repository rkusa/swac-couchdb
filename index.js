var nano = require('nano')(process.env.CLOUDANT_URL || 'http://localhost:5984')

exports.initialize = function(name, opts, cb) {
  var db = nano.use(opts.db)
    , model = this

  model.list = function(/*view, key, callback*/) {
    var args = Array.prototype.slice.call(arguments)
      , callback = args.pop()
      , view = args.shift() || 'all'
      , key = args.shift() || null
      , params = {}
    if (key) params.key = key
    if (!callback) callback = function() {}
    db.view(model._type, view, params, function(err, body) {
      if (err) return callback(err)
      var rows = []
      body.rows.forEach(function(data) {
        var row = new model(data.value)
        row.isNew = false
        rows.push(row)
      })
      callback(null, rows)
    })
  }
  model.get = function(id, callback) {
    if (!callback) callback = function() {}
    db.get(id, function(err, body) {
      if (err) {
        if (err.message === 'missing') return callback(null, null)
        else return callback(err)
      }
      var row = new model(body)
      row.isNew = false
      callback(null, row)
    })
  }
  model.put = function(id, props, callback) {
    if (!callback) callback = function() {}
    db.get(id, function(err, body) {
      if (err) return callback(err)
      var row = new model(body)
      row.isNew = false
      Object.keys(props).forEach(function(key) {
        if (row.hasOwnProperty(key)) row[key] = props[key]
      })
      row._rev = body._rev
      row.$type = name
      db.insert(row, row._id, function(err) {
        if (err) return callback(err)
        callback(null, row)
      })
    })

  }
  model.post = function(props, callback) {
    if (!callback) callback = function() {}
    if (props instanceof model) {
      var row = props
      props = {}
      Object.keys(row).forEach(function(key) {
        props[key] = row[key]
      })
    }
    if (!props._id) delete props._id
    props.$type = name
    db.insert(props, props._id, function(err, body) {
      if (err) return callback(err)
      var row = new model(props)
      row._id = body.id
      row.isNew = false
      callback(null, row)
    })
  }
  model.delete = function(id, callback) {
    if (!callback) callback = function() {}
    db.get(id, function(err, body) {
      if (err) return callback(err)

      db.destroy(id, body._rev, function(err) {
        if (err) return callback(err)
        callback()
      })
    })
  }

  db.head('_design/' + name, function(err, _, headers) {
    if (err) {
      db.insert({
        language: 'javascript',
        views: {
          all: {
            map: "function (doc) { if(doc.$type === '" + name + "') emit(null, doc); }"
          }
        }
      }, '_design/' + name, cb)
    } else {
      if (cb) cb()
    }
  })
}
