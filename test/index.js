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
        })
        this.property('key')
        this.property('type')
      }, done)
    })
    it('should create a _design document', function() {
      db.get('_design/TestModel', function(err, body) {
        should.not.exist(err)
        body.views.all.map.should.equal("function (doc) { if(doc.$type === 'TestModel') emit(doc._id, null); }")
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
  })
})
