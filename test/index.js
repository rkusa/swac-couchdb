var Arkansas = require('arkansas')
  , should   = require('should')
  , nano     = require('nano')('http://localhost:5984')
  , db, model

var domain = require('domain')
  , d = domain.create()
d.req = {}

var domainify = function(fn) {
  return function(done) {
    d.run(fn.bind(null, done))
  }
}

describe('Arkansas CouchDB Adapter', function() {
  var view = function(doc) {
    if (doc.$type === 'TestModel') emit(doc.key, doc);
  }
  before(function(done) {
    nano.db.create('arkansas-couchdb-test', function(err) {
      if (err) return done(err)
      db = nano.use('arkansas-couchdb-test')
      done()
    })
  })
  after(function(done) {
    nano.db.destroy('arkansas-couchdb-test', done)
  })
  describe('Model Definition', function() {
    before(function(done) {
      model = Arkansas.Model.define('TestModel', function() {
        this.use(require('../'), { db: 'arkansas-couchdb-test' }, function() {
          this.view('by-key', {
            map: view
          })
          this.view('by-fn', function(key, req, callback) {
            callback(null, [key, req])
          })
        })
        this.property('key')
        this.property('type')
      }, done)
    })
    it('should create a _design document', function(done) {
      db.get('_design/TestModel', function(err, body) {
        should.not.exist(err)
        body.views.all.map.should.equal("function (doc) { if(doc.$type === 'TestModel') emit(doc._id, null); }")
        done()
      })
    })
  })
  describe('CRUD', function() {
    var cur
    it('POST should work', domainify(function(done) {
      model.post({ key: '1', type: 'a' }, function(err, row) {
        should.not.exist(err)
        cur = row
        db.get(row.id, function(err, body) {
          if (err) throw err
          body.key.should.equal(row.key)
          body.type.should.equal(row.type)
          done()
        })
      })
    }))
    it('PUT should work', domainify(function(done) {
      cur.key = 2
      cur.type = 'b'
      model.put(cur.id, cur, function(err, row) {
        should.not.exist(err)
        db.get(row.id, function(err, body) {
          if (err) throw err
          body.key.should.equal(cur.key)
          body.type.should.equal(cur.type)
          done()
        })
      })
    }))
    it('GET should work', domainify(function(done) {
      model.get(cur.id, function(err, body) {
        should.not.exist(err)
        body.id.should.equal(cur.id)
        body.key.should.equal(cur.key)
        body.type.should.equal(cur.type)
        done()
      })
    }))
    it('LIST should work', domainify(function(done) {
      model.post({ key: '1', type: 'a' }, function(err, row) {
        should.not.exist(err)
        model.list(function(err, items) {
          if (err) throw err
          items.should.have.lengthOf(2)
          done()
        })
      })
    }))
  })
  describe('Views', function() {
    it('should be created', function(done) {
      db.get('_design/TestModel', function(err, body) {
        should.not.exist(err)
        body.views.should.have.property('by-key')
        body.views['by-key'].map.should.equal(view.toString())
        done()
      })
    })
    it('should work', domainify(function(done) {
      model.list('by-key', 2, function(err, items) {
        should.not.exist(err)
        items.should.have.lengthOf(1)
        done()
      })
    }))
    it('should work with function type views', domainify(function(done) {
      model.list('by-fn', 42, function(err, res) {
        res.should.have.lengthOf(2)
        res[0].should.eql(42)
        res[1].should.eql(d.req)
        done()
      })
    }))
  })
  describe('CouchDB Document Id', function() {
    var cur
    it('should use the model type as namespace', function(done) {
      model.post({ id: 'foobar' }, function(err, instance) {
        should.not.exist(err)
        cur = instance
        instance.should.have.property('_id', model._type + '/foobar')
        instance.should.have.property('id', 'foobar')
        db.get(model._type + '/foobar', function(err, body) {
          should.not.exist(err)
          should.exist(body)
          done()
        })
      })
    })
    it('adapt the id', function(done) {
      model.get(cur.id, function(err, body) {
        should.not.exist(err)
        should.exist(body)
        cur.id.should.eql(body.id)
        done()
      })
    })
  })
  describe('CouchDB Document Revision', function() {
    var cur
    it('should extend the model\'s prototype', function() {
      model.prototype.should.have.property('_rev')
    })
    it('should set the #_rev on POST', function(done) {
      model.post({}, function(err, instance) {
        should.not.exist(err)
        cur = instance
        instance.should.have.property('_rev')
        db.get(cur._id, function(err, body) {
          should.not.exist(err)
          instance.should.have.property('_rev', body._rev)
          done()
        })
      })
    })
    it('should set the #_rev on GET', function(done) {
      model.get(cur._id, function(err, instance) {
        should.not.exist(err)
        instance.should.have.property('_rev', cur._rev)
        done()
      })
    })
    it('should set the #_rev on LIST', function(done) {
      model.list(function(err, rows) {
        should.not.exist(err)
        rows.forEach(function(row) {
          row.should.have.property('_rev')
        })
        done()
      })
    })
    it('should update the #_rev on PUT', function(done) {
      model.put(cur._id, { key: 42 }, function(err, updated) {
        should.not.exist(err)
        cur._rev.should.not.eql(updated._rev)
        db.get(cur._id, function(err, body) {
          should.not.exist(err)
          updated._rev.should.eql(body._rev)
          done()
        })
      })
    })
  })
})
