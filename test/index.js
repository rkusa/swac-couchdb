var Arkansas = require('arkansas')
  , should   = require('should')
  , nano     = require('nano')('http://localhost:5984')
  , db, model

describe('Arkansas CouchDB Adapter', function() {
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
        this.use(require('../'), { db: 'arkansas-couchdb-test' })
        this.property('key')
        this.property('type')
      }, done)
    })
    it('should create a _design document', function() {
      db.get('_design/TestModel', function(err, body) {
        should.not.exist(err)
        body.views.all.map.should.equal("function (doc) { if(doc.$type === 'TestModel') emit(null, doc); }")
      })
    })
  })
  describe('CRUD', function() {
    var cur
    it('POST should work', function(done) {
      model.post({ key: '1', type: 'a' }, function(err, row) {
        should.not.exist(err)
        cur = row
        db.get(row._id, function(err, body) {
          if (err) throw err
          body.key.should.equal(row.key)
          body.type.should.equal(row.type)
          done()
        })
      })
    })
    it('PUT should work', function(done) {
      cur.key = 2
      cur.type = 'b'
      model.put(cur._id, cur, function(err, row) {
        should.not.exist(err)
        db.get(row._id, function(err, body) {
          if (err) throw err
          body.key.should.equal(cur.key)
          body.type.should.equal(cur.type)
          done()
        })
      })
    })
    it('GET should work', function(done) {
      model.get(cur._id, function(err, body) {
        should.not.exist(err)
        body.key.should.equal(cur.key)
        body.type.should.equal(cur.type)
        done()
      })
    })
    it('LIST should work', function(done) {
      model.post({ key: '1', type: 'a' }, function(err, row) {
        should.not.exist(err)
        model.list(function(err, items) {
          if (err) throw err
          items.should.have.lengthOf(2)
          done()
        })
      })
    })
  })
  describe('Views', function() {
    before(function(done) {
      db.get('_design/TestModel', function(err, body) {
        if (err) throw err
        should.not.exist(err)
        body.views.byKey = {
          map: "function (doc) { if(doc.$type === 'TestModel') emit(doc.key, doc); }"
        }
        db.insert(body, '_design/TestModel', function(err) {
          if (err) throw err
          done()
        })
      })
    })
    it('should work', function(done) {
      model.list('byKey', 2, function(err, items) {
        should.not.exist(err)
        items.should.have.lengthOf(1)
        done()
      })
    })
  })
})
